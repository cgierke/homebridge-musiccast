import type { Logging } from "homebridge";

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
export interface FeatureResponse {
    response_code: number;
    //system: System;
    zone: ZoneEntity[];
    //tuner: Tuner;
    //netusb: Netusb;
    //distribution: Distribution;
    //ccs: Ccs;
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
export interface PresetInfoResponse {
    response_code: number;
    preset_info: PresetInfo[];
    //func_list?: (string)[] | null;
}
interface PresetInfo {
    identifier: number,
    presetId: number;
    input: string;
    text: string;
    displayText: string;
    //attribute?: number | null;
}
interface CommandResponse {
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
interface ZoneEntity {
    id: string;
    //func_list?: (string)[] | null;
    //input_list?: (string)[] | null;
    sound_program_list?: (string)[];
    //surr_decoder_type_list?: (string)[] | null;
    //tone_control_mode_list?: (string)[] | null;
    //link_control_list?: (string)[] | null;
    link_audio_delay_list?: (string)[];
    //range_step?: (RangeStepEntity)[] | null;
    //scene_num?: number | null;
    //cursor_list?: (string)[] | null;
    //menu_list?: (string)[] | null;
    //actual_volume_mode_list?: (string)[] | null;
    //ccs_supported?: (string)[] | null;
    //zone_b?: boolean | null;
}
interface ServerInfoRequest {
    group_id: string;
    zone: string;
    type: string;
    client_list?: (string)[] | null;
}
interface ClientInfoRequest {
    group_id: string;
    zone: (string)[];
    server_ip_address: string;
}

export class YamahaAPI {
    private readonly zone: string = "main";
    private readonly requestTimeout: number = 5000;

    constructor(
        private readonly log: Logging,
        private readonly groupId: string,
        private readonly presetInfoRegex?: RegExp,
    ) { }

    private async httpRequest(url: string, postData?: string): Promise<unknown> {
        this.log.debug(url);
        let response: Response;
        try {
            response = await fetch(url, {
                method: postData ? "POST" : "GET",
                headers: postData
                    ? { 'Accept': 'application/json', 'Content-Type': 'application/json' }
                    : { 'Accept': 'application/json' },
                body: postData,
                signal: AbortSignal.timeout(this.requestTimeout),
            });
        } catch (error) {
            const cause = error instanceof Error ? error.cause : undefined;
            const reason = cause instanceof Error ? cause.message : (error instanceof Error ? error.message : String(error));
            throw new Error(`request to ${url} failed: ${reason}`, { cause: error });
        }
        if (!response.ok) {
            throw new Error(`request to ${url} failed: HTTP ${response.status}`);
        }
        let result: unknown;
        try {
            result = await response.json();
        } catch {
            throw new Error(`request to ${url} failed: response is not valid JSON`);
        }
        this.log.debug("httpRequest result", result);
        const responseCode = (result as { response_code?: number } | null)?.response_code;
        if (responseCode !== undefined && responseCode !== 0) {
            this.log.warn(`request to ${url} returned response_code ${responseCode}`);
        }
        return result;
    }

    public async getDeviceInfo(host: string): Promise<DeviceInfoResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/system/getDeviceInfo';
        return this.httpRequest(url).then(result => result as DeviceInfoResponse);
    }

    public async getFeatures(host: string): Promise<FeatureResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/system/getFeatures';
        return this.httpRequest(url).then(result => result as FeatureResponse);
    }

    public async getPlayInfo(host: string): Promise<PlayInfoResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/netusb/getPlayInfo';
        return this.httpRequest(url).then(result => result as PlayInfoResponse);
    }

    public async getPresetInfo(host: string): Promise<PresetInfoResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/netusb/getPresetInfo';
        const presetInfos = await this.httpRequest(url) as PresetInfoResponse;
        for (let i = 0; i < presetInfos.preset_info.length; i++) {
            presetInfos.preset_info[i].presetId = i + 1;
            presetInfos.preset_info[i].identifier = i + 200;
            presetInfos.preset_info[i].displayText = presetInfos.preset_info[i].text;
            if (this.presetInfoRegex !== undefined) {
                presetInfos.preset_info[i].displayText = presetInfos.preset_info[i].displayText.replace(this.presetInfoRegex, '').trim();
            }
        }
        presetInfos.preset_info = presetInfos.preset_info.filter(
            function (presetInfo) {
                return ((presetInfo.input === 'server' || presetInfo.input === 'net_radio') && presetInfo.text !== "");
            }
        );
        return presetInfos;
    }

    public async getStatus(host: string): Promise<StatusResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/getStatus';
        return this.httpRequest(url).then(result => result as StatusResponse);
    }

    public async setInput(host: string, input: string): Promise<CommandResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/setInput?input=' + input;
        return this.httpRequest(url).then(result => result as CommandResponse);
    }

    public async setLinkAudioDelay(host: string, delay: string): Promise<CommandResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/setLinkAudioDelay?delay=' + delay;
        return this.httpRequest(url).then(result => result as CommandResponse);
    }

    public async setSoundProgram(host: string, program: string): Promise<CommandResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/setSoundProgram?program=' + program;
        return this.httpRequest(url).then(result => result as CommandResponse);
    }

    public async setPlayback(host: string, playback: string): Promise<CommandResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/netusb/setPlayback?playback=' + playback;
        return this.httpRequest(url).then(result => result as CommandResponse);
    }

    public async setPower(host: string, power: boolean): Promise<CommandResponse> {
        const parameter = (power === true) ? "on" : "standby";
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/setPower?power=' + parameter;
        return this.httpRequest(url).then(result => result as CommandResponse);
    }

    public async setVolume(host: string, volume: number): Promise<CommandResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/' + this.zone + '/setVolume?volume=' + volume;
        return this.httpRequest(url).then(result => result as CommandResponse);
    }

    public async recallPreset(host: string, preset: number): Promise<CommandResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/netusb/recallPreset?zone=' + this.zone + '&num=' + preset.toString();
        return this.httpRequest(url).then(result => result as CommandResponse);
    }

    public async startDistribution(host: string): Promise<CommandResponse> {
        const url = 'http://' + host + '/YamahaExtendedControl/v1/dist/startDistribution?num=0';
        return this.httpRequest(url).then(result => result as CommandResponse);
    }

    public async setClientInfo(clientHost: string, serverHost: string): Promise<CommandResponse> {
        const url = 'http://' + clientHost + '/YamahaExtendedControl/v1/dist/setClientInfo';
        const clientInfo: ClientInfoRequest = {
            group_id: this.groupId,
            zone: [this.zone],
            server_ip_address: serverHost
        };
        return this.httpRequest(url, JSON.stringify(clientInfo)).then(result => result as CommandResponse);
    }

    public async setServerInfo(clientHost: string, serverHost: string, type: string): Promise<CommandResponse> {
        const url = 'http://' + serverHost + '/YamahaExtendedControl/v1/dist/setServerInfo';
        const serverInfo: ServerInfoRequest = {
            group_id: this.groupId,
            zone: this.zone,
            type: type,
            client_list: [clientHost]
        };
        return this.httpRequest(url, JSON.stringify(serverInfo)).then(result => result as CommandResponse);
    }
}
