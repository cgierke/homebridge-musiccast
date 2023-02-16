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
    server: string;
    clients: string[];
    inputs: InputConfig[];
}

class MusiccastMultiroom implements IndependentPlatformPlugin {
    constructor(log: Logging, platformConfig: PlatformConfig, api: API) {
        const config = platformConfig as MusiccastMultiroomConfig;
        const cache = new Cache(log);
        const yamahaApi = new YamahaAPI(log);
        const serverConfig: Config = {
            host: config.server,
            clients: config.clients,
            inputs: config.inputs
        };
        const server = new YamahaDevice(serverConfig, api, cache, log, yamahaApi);
        server.publishAccessory(PLUGIN_NAME);
        for (let clientHost of config.clients) {
            let clientConfig: Config = {
                host: clientHost,
                serverHost: config.server
            }
            let client = new YamahaDevice(clientConfig, api, cache, log, yamahaApi);
            client.publishAccessory(PLUGIN_NAME);
        }
    }
}
