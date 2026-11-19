# astana-band

A Claude Code mod: a monochrome pixel band right above the prompt box.

- **Claude usage limits**: the 5-hour and 7-day windows as pixel bars, with percent used and time to reset. Bars fill up when a session starts; the last block blinks past 85%.
- **Astana weather**: temperature, sky and wind from [Open-Meteo](https://open-meteo.com) (free, no API key), refreshed every 15 minutes.
- **Winter mood**: falling snow across the band and a tiny 16-bit tree.

`/astana-band` hides or shows the band.

Limits show up after Claude's first reply in a session, and only on a Claude subscription.

## Install

At the prompt of a terminal session:

```
/plugin install astana-band --marketplace sannder01/astana-band
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it load in every session).

From a shell:

```
claude plugin install astana-band --marketplace sannder01/astana-band
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `sannder01/astana-band`, then Add plugin.

## License

MIT
