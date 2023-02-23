import {
    API,
    IndependentPlatformPlugin,
    Logging,
    PlatformConfig,
} from "homebridge";
import { Cache } from "./Cache";
import { YamahaAPI } from "./YamahaAPI";
import { Config, InputConfig, YamahaDevice } from "./YamahaDevice";

const PLUGIN_NAME = "homebridge-musiccast-multiroom";
const PLATFORM_NAME = "MusiccastMultiroom";

export = (api: API) => {
    api.registerPlatform(PLATFORM_NAME, MusiccastMultiroom);
};

interface MusiccastMultiroomConfig {
    platform: string;
    server: {
        host: string;
        volumePercentageLow?: number;
        volumePercentageHigh?: number;
        inputs: InputConfig[];
    };
    clients: {
        host: string;
        volumePercentageLow?: number;
        volumePercentageHigh?: number;
    }[];
}

class MusiccastMultiroom implements IndependentPlatformPlugin {
    constructor(log: Logging, platformConfig: PlatformConfig, api: API) {
        const config = platformConfig as MusiccastMultiroomConfig;
        const cache = new Cache(log);
        const yamahaApi = new YamahaAPI(log);
        const devices: YamahaDevice[] = [];
        try {
            var serverConfig: Config = {
                host: config.server.host,
                clients: config.clients.map(item => item.host),
                inputs: config.server.inputs
            };
            if (config.server.volumePercentageLow !== undefined) {
                serverConfig.volumePercentageLow = config.server.volumePercentageLow;
            }
            if (config.server.volumePercentageHigh !== undefined) {
                serverConfig.volumePercentageHigh = config.server.volumePercentageHigh;
            }
        } catch (error) {
            log.error("invalid config", error);
            return
        }
        devices.push(new YamahaDevice(serverConfig, api, cache, log, yamahaApi));
        for (let client of config.clients) {
            try {
                var clientConfig: Config = {
                    host: client.host,
                    serverHost: config.server.host
                }
                if (client.volumePercentageLow !== undefined) {
                    clientConfig.volumePercentageLow = client.volumePercentageLow;
                }
                if (client.volumePercentageHigh !== undefined) {
                    clientConfig.volumePercentageHigh = client.volumePercentageHigh;
                }
                devices.push(new YamahaDevice(clientConfig, api, cache, log, yamahaApi));
            } catch (error) {
                log.error("invalid config", error);
                return
            }
        }
        for (let device of devices) {
            device.publishAccessory(PLUGIN_NAME);
        }
    }
}
