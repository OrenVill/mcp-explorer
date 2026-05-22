export declare const APP_DATA_URL_PATH: string;
export declare function isAppDataRequest(url: string | undefined): boolean;
export declare function getAppDataFilePath(): string;
export declare function handleAppData(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void>;
