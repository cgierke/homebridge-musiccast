
<p align="center">
    <img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">
</p>


# Homebridge Yamaha MusicCast Multiroom Plugin

Official MusicCast support in Apple HomeKit is limited. This plugin provides quick access to favorite presets, input source selection and power/volume vontrol within the Apple Home app. Speakers will always be linked to their MusicCast server.

<img src="https://gitlab.com/cgierke/homebridge-musiccast/raw/main/homekit-screenshot-accessories.png" width="550">

Configuration:
* server: IP address or hostname of the Yamaha receiver (or main MusicCast speaker) that will serve music to the clients
* clients: IP addresses or hostnames of the Yamaha speakers (or other MusicCast devices) that will be connected to the server

```
{
    "server": {
        "host": "192.168.178.80",
        ...
    },
    "clients": [
        {
            "host": "192.168.178.81",
            ...
        },
        {
            "host": "192.168.178.82",
            ...
        }
    ],
    "platform": "MusiccastMultiroom"
}
```

---

## Volume

The current Apple Home app doesn't really support volume for speakers and receivers, so the source selector is misused to quickly adjust volume in 6 steps.

<img src="https://gitlab.com/cgierke/homebridge-musiccast/raw/main/homekit-screenshot-volume.png" width="550">

Lower and upper volume limits can be adjusted in the settings for each device. Something like 25% (lower limit) to 65% (upper limit) is probably reasonable for most environments.

```
{
    "server": {
        ...
        "volumePercentageLow": 25,
        "volumePercentageHigh": 65,
        ...
    },
    "clients": [
        {
            ...
            "volumePercentageLow": 30,
            "volumePercentageHigh": 65
        }
    ],
    "platform": "MusiccastMultiroom"
}
```

---

## Input Sources

For the server device, a separate accessory will be published to select the input source. It will provide all favorites saved on the device. Use the Yamaha MusicCast app to save, edit and order favorites.

<img src="https://gitlab.com/cgierke/homebridge-musiccast/raw/main/homekit-screenshot-presets.png" width="550">

Additional inputs like HDMI can be added and named in the settings:
```
{
    "server": {
        ...
        "inputs": [
            {
                "input": "audio3",
                "name": "Plattenspieler"
            },
            {
                "input": "airplay",
                "name": "Airplay"
            },
            {
                "input": "hdmi1",
                "name": "Apple TV"
            }
        ]
    },
    ...
    "platform": "MusiccastMultiroom"
}
```

---

## Additional switches

When supported by the server device, up to two additional switches will be published:

<img src="https://gitlab.com/cgierke/homebridge-musiccast/raw/main/homekit-screenshot-switches.png" width="550">

- Surround Decoder:
  - on: set sound program to `Surround Decoder`
  - off: set sound program to `Straight`
- Lip Sync:
  - on: set link audio delay to `Lip Sync`, which prefers lipsync between audio and hdmi video (and maybe cause delay between connected speakers)
  - off: set link audio delay to `Audio Sync` prefer audio sync between all connected spearkers (and maybe cause delay between audio and hdmi video)

---

## Language

Initial names for devices/switches etc. will all be in English, rename them if necessary in your HomeKit app.
