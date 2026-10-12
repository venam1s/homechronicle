# Mobile Install (PWA)

homechronicle can be added to your home screen so it behaves like a native app.

## Android (Chrome)

1. Open homechronicle in Chrome (e.g., `http://<server-ip>:3000`)
2. Tap the three-dot menu in the top-right
3. Tap **Install app** (or **Add to Home screen**)
4. Confirm by tapping **Install**
5. Launch from your home screen or app drawer

## iPhone / iPad (Safari)

1. Open homechronicle in Safari (e.g., `http://<server-ip>:3000`)
2. Tap the **Share** button (square with an up arrow)
3. Scroll down and tap **Add to Home Screen**
4. Optionally rename it, then tap **Add**
5. Launch from your home screen

## Floating navigation

![Timeline on a phone, with the floating navigation button at the bottom left](../screenshots/mobile-timeline.png ':size=300')

On screens narrower than 1024 px (phones and tablets), the top navigation bar is replaced by a floating navigation button at the bottom-left of the screen. Tap it to open the list of pages — Dashboard, Devices, Timeline, Alerts, Settings — and tap a page to go there. The menu closes when you choose a page, tap outside it, or scroll. The page leaves room at the bottom so the button never covers the end of it.

With sign-in enabled, **Sign out** is at the bottom of the same menu.

The desktop bar's theme switch and account menu aren't in the floating navigation. Change the theme in **Settings › Appearance** (see [Appearance](appearance.md)) and your account in **Settings › Account**.

On phones, Settings uses a drop-down menu at the top instead of the side list, and the dashboard becomes a single column below 768 px.

## Notes

- The app must be served over your local network or HTTPS (not from a file path)
- If install options don't appear, refresh once and try again
- On iPhone, only Safari supports **Add to Home Screen** reliably
