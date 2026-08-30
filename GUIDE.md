# Fiets of OV — User Guide

**Live app:** `https://fiets.89.125.35.116.sslip.io/`

One question, answered in one screen: **should I bike, or take public transport?**
Type where you're going; the app routes both options, checks the rain forecast along
your ride, and tells you which one gets you there dry and fast — with both drawn on
the map so you can judge for yourself.

---

## Planning a trip

1. **Set your endpoints.** Type a place name (`Vondelpark`), pick from suggestions,
   tap the map, or use the location button for "from here". Coordinates like
   `52.373,4.893` work too.
2. **Read the verdict.** The result card leads with the recommendation and the reason,
   in plain words. A real answer for Centraal Station → Vondelpark on a dry day:

   > **Bike** — *dry during your 17-min ride* · bike **17 min** vs transit **31 min**

3. **Compare on the map.** Every option is drawn; the recommended one is highlighted.
   Open an option to see its legs — where you ride, where you board, stop names,
   times and distances.

The recommendation is one of:

| Verdict | When |
|---|---|
| **Bike** | Your ride stays dry (or nearly), and pedalling is competitive on time |
| **Transit** | Real rain on your route, or transit is clearly faster |
| **Bike + ride** | Cycle to a hub, hop on transit — best of both when it wins |

If the forecast service is briefly unreachable the app still answers, using times
only, and says so — you are never left without a route.

## Rain, live

- The verdict already includes the forecast **along your ride, for your departure
  time** — not just "is it raining now".
- Toggle the **rain radar** overlay to watch showers move over the city and time your
  departure between them.

## Nearby stops

Around your location or any point you pick, the app shows GVB stops sorted by
distance — with Centraal Station 43 m away you'll see it first, platforms and all.

## Rain alerts for your commute

Create an account (email + password) and save a recurring trip — label, endpoints,
departure time, weekdays. The service then watches the forecast for that exact trip
and warns you before you leave whether today is a bike day. Manage alerts from the
account menu.

## The interface

- **Dark theme — blue & white.** The night look is the daytime look inverted: deep
  canal-water navy surfaces with white text, the exact mirror of the light theme's
  navy-on-white. It follows your system preference, or toggle it from the header.
  Both themes hold WCAG AA/AAA contrast throughout.
- **Phone-first.** Every control meets the 44 px touch floor; the home screen morphs
  into the map as you scroll, and search arrives as its own sheet.
- **Keyboard and screen-reader friendly.** Focus is always visible, including on the
  dark theme.

---

## For developers

```bash
npm ci
npm run dev        # against the mock API (no backend needed): VITE_API_MODE=mock
npm test           # vitest — includes theme-contrast and accessibility guards
npm run build      # production build
```

Point the dev server at a real backend with `VITE_API_BASE=<url>` in `.env`.
The API itself is documented in the backend repo's `API.md` — same examples, same
real outputs, ready to `curl`.
