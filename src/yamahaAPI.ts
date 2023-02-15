import {
    Logging,
} from "homebridge";
import { ClientRequest, request, RequestOptions } from "http";

export interface DeviceInfoResponse {
    response_code: number;
    model_name: string;
    //destination: string;
    //device_id: string;
    //system_id: string;
    system_version: number;
    api_version: number;
    //netmodule_generation: number;
    //netmodule_version: string;
    //netmodule_checksum: string;
    serial_number: string;
    //category_code: number;
    //operation_mode: string;
    //update_error_code: string;
    //update_data_type: number;
}
export interface PresetInfoResponse {
    response_code: number;
    preset_info: (PresetInfo)[];
    //func_list?: (string)[] | null;
}
export interface PresetInfo {
    identifier: number,
    presetId: number;
    input: string;
    text: string;
    //attribute?: number | null;
}
interface Response {
    response_code: number;
}
export interface StatusResponse {
    response_code: number;
    power: string;
    //sleep: number;
    volume: number;
    mute: boolean;
    max_volume: number;
    input: string;
    input_text: string;
    distribution_enable: boolean;
    sound_program: string;
    //surr_decoder_type: string;
    //direct: boolean;
    //enhancer: boolean;
    //tone_control: ToneControl;
    //dialogue_level: number;
    //subwoofer_volume: number;
    //link_control: string;
    link_audio_delay: string;
    //disable_flags: number;
    //contents_display: boolean;
    //actual_volume: ActualVolume;
    //extra_bass: boolean;
    //adaptive_drc: boolean;
}
/*
interface ToneControl {
    mode: string;
    bass: number;
    treble: number;
}
interface ActualVolume {
    mode: string;
    value: number;
    unit: string;
}
*/
interface ServerInfo {
    group_id: string;
    zone: string;
    type: string;
    client_list?: (string)[] | null;
}
interface ClientInfo {
    group_id: string;
    zone: (string)[];
    server_ip_address: string;
}
export interface PlayInfoResponse {
    response_code: number;
    input: string;
    //play_queue_type: string;
    playback: string;
    //repeat: string;
    //shuffle: string;
    play_time: number;
    //total_time: number;
    artist: string;
    album: string;
    track: string;
    //albumart_url: string;
    //albumart_id: number;
    //usb_devicetype: string;
    //auto_stopped: boolean;
    //attribute: number;
    //repeat_available?: (null)[] | null;
    //shuffle_available?: (null)[] | null;
}

export class yamahaAPI {
    private readonly log: Logging;
    private readonly groupId: string = "00112233445566778899aabbccddeeff";
    private readonly zone: string = "main";

    constructor(log: Logging) {
        this.log = log;
    }

    private async httpRequest(url: string, postData?: string) {
        this.log.debug(url);
        return new Promise((resolve, reject) => {
            const options: RequestOptions = {};
            if (postData) {
                options.method = "POST";
                options.headers = {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                };
            } else {
                options.method = "GET";
                options.headers = {
                    'Accept': 'application/json',
                }
            }
            const req: ClientRequest = request(url, options);
            req.on('error', (error) => {
                reject(error);
            });
            if (postData) {
                req.write(postData);
            }
            req.end();
            req.on('response', (response) => {
                response.setEncoding('utf8');
                let data: string = '';
                response.on('data', (chunk: string) => {
                    data += chunk;
                });
                response.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        this.log.debug("httpRequest result", result);
                        resolve(result);
                    } catch (error) {
                        this.log.error("httpRequest error", error);
                        reject(error);
                    }
                });
            });
        });
    }

    public async getDeviceInfo(host: string): Promise<DeviceInfoResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/system/getDeviceInfo';
        return (await this.httpRequest(url)) as DeviceInfoResponse;
    }

    public async getPresetInfo(host: string): Promise<PresetInfoResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/netusb/getPresetInfo';
        let presetInfos = await this.httpRequest(url) as PresetInfoResponse;
        for (let i = 0; i < presetInfos.preset_info.length; i++) {
            presetInfos.preset_info[i].presetId = i + 1;
            presetInfos.preset_info[i].identifier = i + 200;
        }
        presetInfos.preset_info = presetInfos.preset_info.filter(
            function (presetInfo) {
                return (presetInfo.input !== "unknown" && presetInfo.text !== "");
            }
        );
        return presetInfos;
    }

    public async setInput(host: string, input: string): Promise<Response> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/setInput?input=' + input;
        return (await this.httpRequest(url)) as Response;
    }

    public async setPower(host: string, power: number): Promise<Response> {
        let parameter = (power == 1) ? "on" : "standby";
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/setPower?power=' + parameter;
        return (await this.httpRequest(url)) as Response;
    }

    public async getStatus(host: string): Promise<StatusResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/getStatus';
        return (await this.httpRequest(url)) as StatusResponse;
    }

    public async setVolume(host: string, volume: number): Promise<StatusResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/setVolume?volume=' + volume;
        return (await this.httpRequest(url)) as StatusResponse;
    }

    public async setLinkAudioDelay(host: string, delay: string): Promise<Response> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/setLinkAudioDelay?delay=' + delay;
        return (await this.httpRequest(url)) as Response;
    }

    public async setSoundProgram(host: string, program: string): Promise<Response> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/setSoundProgram?program=' + program;
        return (await this.httpRequest(url)) as Response;
    }

    public async recallPreset(host: string, preset: number): Promise<Response> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/netusb/recallPreset?zone=' + this.zone + '&num=' + preset.toString();
        return (await this.httpRequest(url)) as Response;
    }

    public async setPlayback(host: string, playback: string): Promise<Response> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/netusb/setPlayback?playback=' + playback;
        return (await this.httpRequest(url)) as Response;
    }

    public async getPlayInfo(host: string): Promise<PlayInfoResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/netusb/getPlayInfo';
        return (await this.httpRequest(url)) as PlayInfoResponse;
    }

    public async startDistribution(host: string): Promise<StatusResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/dist/startDistribution?num=0';
        return (await this.httpRequest(url)) as StatusResponse;
    }

    public async setClientInfo(clientHost: string, serverHost: string): Promise<StatusResponse> {
        const url = 'http://' + clientHost + '/YamahaExtendedControl/v1/dist/setClientInfo';
        const clientInfo: ClientInfo = {
            group_id: this.groupId,
            zone: [this.zone],
            server_ip_address: serverHost
        };
        return (await this.httpRequest(url, JSON.stringify(clientInfo))) as StatusResponse;
    }

    public async setServerInfo(clientHost: string, serverHost: string): Promise<StatusResponse> {
        const url = 'http://' + serverHost + '/YamahaExtendedControl/v1/dist/setServerInfo';
        const serverInfo: ServerInfo = {
            group_id: this.groupId,
            zone: this.zone,
            type: "add",
            client_list: [clientHost]
        };
        return (await this.httpRequest(url, JSON.stringify(serverInfo))) as StatusResponse;
    }
}
