import * as React from 'react';
import { Platform } from 'react-native';
import { BleManager, Device, ScanCallbackType } from 'react-native-ble-plx';

export function useDevice(): [BluetoothRemoteGATTServer | Device | null, () => Promise<void>] {

    // Create state
    let deviceRef = React.useRef<BluetoothRemoteGATTServer | Device | null>(null);
    let [device, setDevice] = React.useState<BluetoothRemoteGATTServer | Device | null>(null);

    // Create callback
    const doConnect = React.useCallback(async () => {
        try {

            let connected = undefined;
            // Connect to device
            if (Platform.OS === "web") {
                connected = await navigator.bluetooth.requestDevice({
                    filters: [{ name: 'OpenGlass' }],
                    optionalServices: ['19B10000-E8F2-537E-4F6C-D104768A1214'.toLowerCase()],
                });
            } else {
                let bleManager = new BleManager();
                bleManager.startDeviceScan(['19B10000-E8F2-537E-4F6C-D104768A1214'], {
                    callbackType: ScanCallbackType.FirstMatch,
                }, (error, device) => {
                    if (device) {
                        bleManager.connectToDevice(device.id).then((device) => {
                            connected = device;
                        });
                    };
                })
            }

            // Connect to gatt
            if (!connected) {
                return;
            }

            let gatt: BluetoothRemoteGATTServer = await connected.gatt!.connect();

            // Update state
            deviceRef.current = gatt;
            setDevice(gatt);

            // Reset on disconnect (avoid loosing everything on disconnect)
            // connected.ongattserverdisconnected = () => {
            //     deviceRef.current = null;
            //     setDevice(null);
            // }
        } catch (e) {
            // Handle error
            console.error(e);
        }
    }, [device]);

    // Return
    return [device, doConnect];
}