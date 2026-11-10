import { app } from "../src/app.js";
import { bootstrap } from "../src/bootstrap.js";
import { setExpressUrl } from "../src/vercel.js";

let ready = null;

export default async function handler(req, res) {
  if (!ready) ready = bootstrap();
  await ready;
  setExpressUrl(req);
  app(req, res);
}
