import {
    API,
    IndependentPlatformPlugin,
    Logging,
    PlatformConfig,
} from "homebridge";
import { cache } from "./cache";
import { yamahaAPI } from "./yamahaAPI";
import { Config, InputConfig, SwitchesConfig, yamahaDevice } from "./yamahaDevice";

const PLUGIN_NAME = "homebridge-musiccast-multiroom";
const PLATFORM_NAME = "MusiccastMultiroom";

export = (api: API) => {
    api.registerPlatform(PLATFORM_NAME, MusiccastMultiroom);
};

interface MusiccastMultiroomConfig {
    platform: string;
    server: string;
    clients: string[];
    switches: SwitchesConfig;
    inputs: InputConfig[];
}

class MusiccastMultiroom implements IndependentPlatformPlugin {
    constructor(log: Logging, platformConfig: PlatformConfig, api: API) {
        const config = platformConfig as MusiccastMultiroomConfig;
        const deviceCache = new cache(log);
        const yamahaApi = new yamahaAPI(log);

        const serverConfig: Config = {
            host: config.server,
            clients: config.clients,
            inputs: config.inputs,
            switches: config.switches
        };
        const server = new yamahaDevice(serverConfig, api, deviceCache, log, yamahaApi);
        server.publishAccessory(PLUGIN_NAME);

        for (let clientHost of config.clients) {
            let clientConfig: Config = {
                host: clientHost,
                serverHost: config.server
            }
            let client = new yamahaDevice(clientConfig, api, deviceCache, log, yamahaApi);
            client.publishAccessory(PLUGIN_NAME);
        }
    }
}
