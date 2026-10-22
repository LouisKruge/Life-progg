// Cross-platform `npm run start:open`: starts the built app and opens it in the default browser.
process.env.LEVELONE_OPEN = "1";
await import("../dist/server/index.js");
