import winston from "winston";
import { Api, TelegramClient } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { StringSession } from "telegram/sessions";
import * as session from "./session";
import escapeStringRegExp from "escape-string-regexp";
import io from "./socket";
import VERSION from "../version";
import { allModules } from "./modules";

import { Logger } from "telegram/extensions";
Logger.setLevel("errors");

const { NODE_ENV } = process.env;

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [], //todo: add file logging
});

if (NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

export default new (class Ion {
  private client: TelegramClient | undefined;
  private session: StringSession | undefined;
  private socket: any;
  private prefixes: string | string[] = "."; // get from config

  public loadedModules: any[] = [];
  private apiId: number;
  private apiHash: string;
  public user: Api.User | undefined;
  public botStatus: number;
  public startTime: Date = new Date();

  constructor() {
    logger.info(`Initializing Ion v${VERSION}`);

    this.apiId = 0;
    this.apiHash = "";
    this.botStatus = 0;

    io.on("connection", (socket) => {
      this.socket = socket;
    });

    this.start();
  }

  log() {}

  async start() {
    this.startTime = new Date();
    const config = session.load();
    this.apiId = Number(config.apiId);
    this.apiHash = config.apiHash;
    this.session = new StringSession(config.session);

    if (this.session && this.apiHash && this.apiId) {
      this.client = new TelegramClient(this.session, this.apiId, this.apiHash, {
        connectionRetries: 15,
      });

      await this.client.start({ botAuthToken: "" });

      this.user = (await this.client.getMe()) as Api.User;
      this.botStatus = 1;

      logger.info(`logged in as ${this.user.firstName}`);
      this.socketHandler();
      this.loadModules();
    }
  }

  createPattern(text: string | RegExp) {
    if (typeof text == "string") {
      const prefixes = (
        Array.isArray(this.prefixes) ? this.prefixes : [this.prefixes]
      )
        .filter(escapeStringRegExp)
        .join("|");

      return new RegExp(`^${prefixes}${text}`);
    }
    return text;
  }

  loadModules() {
    allModules.map((mod) => {
      const { meta } = mod;
      let mode = {
        outgoing: meta.mode === "outgoing",
        icoming: meta.mode === "incoming",
      };

      try {
        this.client?.addEventHandler((event: NewMessageEvent) => {
          mod.handler(event);
        }, new NewMessage({ ...mode, pattern: this.createPattern(meta.match) }));

        this.loadedModules.push({
          ...meta,
        });
      } catch (e) {
        console.log("e", e);
      }
    });
  }

  socketHandler() {
    /** Handle Client Socket */
  }

  stop() {
    this.botStatus = 0;
    /** stop user bot */
  }
})();
