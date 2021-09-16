import { SignedHttpRequest, StringUtils } from "../../src";
import { DatabaseStorage } from "../../src/cache/DatabaseStorage";
import { BrowserCrypto } from "../../src/crypto/BrowserCrypto";
import { CachedKeyPair, CryptoOps } from "../../src/crypto/CryptoOps";
import { createHash } from "crypto";
import { AuthToken } from "@azure/msal-common";

const msrCrypto = require("../polyfills/msrcrypto.min");

let mockDatabase = {
    asymmetricKeys: {},
    symmetricKeys: {}
};

// Mock DatabaseStorage
jest.mock("../../src/cache/DatabaseStorage", () => {
    return {
        DatabaseStorage: jest.fn().mockImplementation((tableName: string) => {
            return {
                dbName: "TestDB",
                version: 1,
                tableName: tableName,
                open: () => {},
                get: (kid: string) => {
                    return mockDatabase[tableName][kid];
                },
                put: (kid: string, payload: any) => {
                    mockDatabase[tableName][kid] = payload;
                    return mockDatabase[tableName][kid];
                },
                delete: (kid: string) => {
                    delete mockDatabase[tableName][kid];
                    return !mockDatabase[tableName][kid];
                }
            }
      })
    }
});

describe("SignedHttpRequest.ts Unit Tests", () => {
    jest.setTimeout(30000)

    let oldWindowCrypto = window.crypto;
    

    beforeEach(() => {
        jest.spyOn(BrowserCrypto.prototype as any, "getSubtleCryptoDigest").mockImplementation((): Promise<ArrayBuffer> => {
            return Promise.resolve(createHash("SHA256").update(Buffer.from("test-data")).digest());
        });
        
        oldWindowCrypto = window.crypto;
        //@ts-ignore
        window.crypto = {
            ...oldWindowCrypto,
            ...msrCrypto
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
        //@ts-ignore
        window.crypto = oldWindowCrypto;
    });

    it("generates expected kid", async () => {
        const shr: SignedHttpRequest = new SignedHttpRequest({
            resourceRequestUri: "https://consoto.com", 
            resourceRequestMethod: "GET"
        });
        const kid = await shr.generatePublicKeyThumbprint();
        expect(kid).toEqual("oYYABCL-q4VzKcaE6f6RQSsaXbCEEAs3qYz8lbYqqGc");
    });

    it("generates expected pop token", async () => {
        const payload = "jwt-payload";
        const nonce = "test-nonce";
        const ts = 123456;

        const shr: SignedHttpRequest = new SignedHttpRequest({
            resourceRequestUri: "https://consoto.com/path", 
            resourceRequestMethod: "GET"
        });
        const kid = await shr.generatePublicKeyThumbprint();

        const popToken = await shr.signRequest(payload, kid, {
            nonce,
            ts
        });

        const decodedToken = AuthToken.extractTokenClaims(popToken, new CryptoOps())

        expect(decodedToken.nonce).toEqual("test-nonce");
        expect(decodedToken.ts).toEqual(123456);
        expect(decodedToken.at).toEqual(payload);
        expect(decodedToken.u).toEqual("consoto.com");
        expect(decodedToken.p).toEqual("/path/");
        expect(decodedToken.m).toEqual("GET");
    });

    it("removes keys", async () => {
        const shr: SignedHttpRequest = new SignedHttpRequest({
            resourceRequestUri: "https://consoto.com/path", 
            resourceRequestMethod: "GET"
        });
        const kid = await shr.generatePublicKeyThumbprint();

        const removeOp = await shr.removeKeys(kid);

        expect(removeOp).toEqual(true);
    })
});
