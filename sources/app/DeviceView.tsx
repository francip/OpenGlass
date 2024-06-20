import * as React from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { rotateImage } from '../modules/imaging';
import { toBase64Image } from '../utils/base64';
import { Agent } from '../agent/Agent';
import { InvalidateSync } from '../utils/invalidateSync';
import { textToSpeech } from '../modules/openai';
import { Device } from 'react-native-ble-plx';

function usePhotos(device: BluetoothRemoteGATTServer | Device) {

    // Subscribe to device
    const [photos, setPhotos] = React.useState<Uint8Array[]>([]);
    const [subscribed, setSubscribed] = React.useState<boolean>(false);
    React.useEffect(() => {
        (async () => {

            let previousChunk = -1;
            let buffer: Uint8Array = new Uint8Array(0);
            function onChunk(id: number | null, data: Uint8Array) {

                // Resolve if packet is the first one
                if (previousChunk === -1) {
                    if (id === null) {
                        return;
                    } else if (id === 0) {
                        previousChunk = 0;
                        buffer = new Uint8Array(0);
                    } else {
                        return;
                    }
                } else {
                    if (id === null) {
                        console.log('Photo received', buffer);
                        rotateImage(buffer, '270').then((rotated) => {
                            console.log('Rotated photo', rotated);
                            setPhotos((p) => [...p, rotated]);
                        });
                        previousChunk = -1;
                        return;
                    } else {
                        if (id !== previousChunk + 1) {
                            previousChunk = -1;
                            console.error('Invalid chunk', id, previousChunk);
                            return;
                        }
                        previousChunk = id;
                    }
                }

                // Append data
                buffer = new Uint8Array([...buffer, ...data]);
            }

            // Subscribe for photo updates
            let photoCharacteristic = undefined;
            if (Platform.OS === "web") {
                const service = await (device as BluetoothRemoteGATTServer).getPrimaryService('19B10000-E8F2-537E-4F6C-D104768A1214'.toLowerCase());
                photoCharacteristic = await service.getCharacteristic('19b10005-e8f2-537e-4f6c-d104768a1214');
                await photoCharacteristic.startNotifications();
                photoCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
                    let value = (e.target as BluetoothRemoteGATTCharacteristic).value!;
                    let array = new Uint8Array(value.buffer);
                    if (array[0] == 0xff && array[1] == 0xff) {
                        onChunk(null, new Uint8Array());
                    } else {
                        let packetId = array[0] + (array[1] << 8);
                        let packet = array.slice(2);
                        onChunk(packetId, packet);
                    }
                });
            } else {
                const service = (await (device as Device).services()).find((s) => s.uuid === '19B10000-E8F2-537E-4F6C-D104768A1214'.toLowerCase())!;
                photoCharacteristic = (await service.characteristics()).find((c) => c.uuid === '19b10005-e8f2-537e-4f6c-d104768a1214')!;
                photoCharacteristic.monitor((error, characteristic) => {
                    if (error) {
                        console.error('Error monitoring characteristic', error);
                        return;
                    }
                    if (characteristic === null) {
                        return;
                    }
                    let value = characteristic.value!;
                    let array = new Uint8Array(Buffer.from(value));
                    if (array[0] == 0xff && array[1] == 0xff) {
                        onChunk(null, new Uint8Array());
                    } else {
                        let packetId = array[0] + (array[1] << 8);
                        let packet = array.slice(2);
                        onChunk(packetId, packet);
                    }
                });
            };
            setSubscribed(true);
        })();
    }, []);

    return [subscribed, photos] as const;
}

export const DeviceView = React.memo(({ device }: { device: BluetoothRemoteGATTServer | Device }) => {
    const [subscribed, photos] = usePhotos(device);
    const agent = React.useMemo(() => new Agent(), []);
    const agentState = agent.use();

    // Background processing agent
    const processedPhotos = React.useRef<Uint8Array[]>([]);
    const sync = React.useMemo(() => {
        let processed = 0;
        return new InvalidateSync(async () => {
            if (processedPhotos.current.length > processed) {
                let unprocessed = processedPhotos.current.slice(processed);
                processed = processedPhotos.current.length;
                await agent.addPhoto(unprocessed);
            }
        });
    }, []);
    React.useEffect(() => {
        processedPhotos.current = photos;
        sync.invalidate();
    }, [photos]);

    React.useEffect(() => {
        if (agentState.answer) {
            textToSpeech(agentState.answer)
        }
    }, [agentState.answer])

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {photos.map((photo, index) => (
                        <Image key={index} style={{ width: 100, height: 100 }} source={{ uri: toBase64Image(photo) }} />
                    ))}
                </View>
            </View>

            <View style={{ backgroundColor: 'rgb(28 28 28)', height: 600, width: 600, borderRadius: 64, flexDirection: 'column', padding: 64 }}>
                <View style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
                    {agentState.loading && (<ActivityIndicator size="large" color={"white"} />)}
                    {agentState.answer && !agentState.loading && (<ScrollView style={{ flexGrow: 1, flexBasis: 0 }}><Text style={{ color: 'white', fontSize: 32 }}>{agentState.answer}</Text></ScrollView>)}
                </View>
                <TextInput
                    style={{ color: 'white', height: 64, fontSize: 32, borderRadius: 16, backgroundColor: 'rgb(48 48 48)', padding: 16 }}
                    placeholder='What do you need?'
                    placeholderTextColor={'#888'}
                    readOnly={agentState.loading}
                    onSubmitEditing={(e) => agent.answer(e.nativeEvent.text)}
                />
            </View>
        </View>
    );
});