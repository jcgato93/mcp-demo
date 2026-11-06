import { loadConfig } from "./config.js";
import { issueToken } from "./tokens.js";

const user = process.argv[2] ?? "alice";
console.log(await issueToken(loadConfig(), user));
