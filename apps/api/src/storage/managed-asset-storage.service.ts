import {
  randomUUID,
} from "node:crypto";

import {
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";

import {
  resolve,
} from "node:path";

import {
  Injectable,
} from "@nestjs/common";

import {
  BlobServiceClient,
  type ContainerClient,
} from "@azure/storage-blob";

import {
  RuntimeConfigService,
} from "../common/config/runtime-config.service.js";

import {
  contentTypeForStorageKey,
  extensionForContentType,
  type ManagedImageContentType,
} from "../common/media/image-validation.js";

export interface StoredManagedAsset {
  storageKey: string;
  contentType: ManagedImageContentType;
  sizeBytes: number;
}

export interface LoadedManagedAsset {
  storageKey: string;
  contentType: ManagedImageContentType;
  sizeBytes: number;
  bytes: Buffer;
}

const STORAGE_KEY_PATTERN =
  /^[0-9a-fA-F-]{36}\.(jpg|png|webp)$/;

@Injectable()
export class ManagedAssetStorageService {
  private azureContainer:
    Promise<ContainerClient> | null =
      null;

  constructor(
    private readonly config:
      RuntimeConfigService,
  ) {}

  async store(
    bytes: Buffer,
    contentType:
      ManagedImageContentType,
  ): Promise<StoredManagedAsset> {
    const storageKey =
      `${randomUUID()}.${extensionForContentType(contentType)}`;

    if (
      this.config.value
        .VELORA_ASSET_STORAGE_PROVIDER ===
      "LOCAL"
    ) {
      const directory =
        this.localDirectory();

      await mkdir(
        directory,
        {
          recursive:
            true,
        },
      );

      await writeFile(
        resolve(
          directory,
          storageKey,
        ),
        bytes,
      );
    }
    else {
      const container =
        await this.container();

      const upload =
        await container
          .getBlockBlobClient(
            storageKey,
          )
          .uploadData(
            bytes,
            {
              blobHTTPHeaders: {
                blobContentType:
                  contentType,
              },
            },
          );

      if (
        !upload.etag
      ) {
        throw new Error(
          "Azure Blob no confirmó la escritura del asset.",
        );
      }
    }

    return {
      storageKey,
      contentType,
      sizeBytes:
        bytes.byteLength,
    };
  }

  async load(
    storageKey: string,
  ): Promise<LoadedManagedAsset> {
    const key =
      this.requireSafeKey(
        storageKey,
      );

    let bytes: Buffer;

    if (
      this.config.value
        .VELORA_ASSET_STORAGE_PROVIDER ===
      "LOCAL"
    ) {
      bytes =
        await readFile(
          resolve(
            this.localDirectory(),
            key,
          ),
        );
    }
    else {
      bytes =
        await (
          await this.container()
        )
          .getBlockBlobClient(
            key,
          )
          .downloadToBuffer();
    }

    return {
      storageKey:
        key,
      contentType:
        contentTypeForStorageKey(
          key,
        ),
      sizeBytes:
        bytes.byteLength,
      bytes,
    };
  }

  async delete(
    storageKey: string,
  ): Promise<void> {
    const key =
      this.requireSafeKey(
        storageKey,
      );

    if (
      this.config.value
        .VELORA_ASSET_STORAGE_PROVIDER ===
      "LOCAL"
    ) {
      try {
        await unlink(
          resolve(
            this.localDirectory(),
            key,
          ),
        );
      }
      catch (error) {
        if (
          !this.isMissingFile(
            error,
          )
        ) {
          throw error;
        }
      }

      return;
    }

    await (
      await this.container()
    )
      .getBlockBlobClient(
        key,
      )
      .deleteIfExists();
  }

  private localDirectory():
    string {
    return resolve(
      process.cwd(),
      this.config.value
        .VELORA_ASSET_LOCAL_DIR,
    );
  }

  private container():
    Promise<ContainerClient> {
    if (
      this.azureContainer
    ) {
      return this.azureContainer;
    }

    this.azureContainer =
      this.createContainer();

    return this.azureContainer;
  }

  private async createContainer():
    Promise<ContainerClient> {
    const connectionString =
      this.config.value
        .AZURE_STORAGE_CONNECTION_STRING
        ?.trim();

    if (
      !connectionString
    ) {
      throw new Error(
        "AZURE_STORAGE_CONNECTION_STRING es obligatorio cuando VELORA_ASSET_STORAGE_PROVIDER=AZURE_BLOB.",
      );
    }

    const service =
      BlobServiceClient
        .fromConnectionString(
          connectionString,
        );

    const container =
      service
        .getContainerClient(
          this.config.value
            .VELORA_AZURE_BLOB_CONTAINER,
        );

    await container
      .createIfNotExists();

    return container;
  }

  private requireSafeKey(
    value: string,
  ): string {
    const key =
      value.trim();

    if (
      !STORAGE_KEY_PATTERN
        .test(
          key,
        )
    ) {
      throw new Error(
        "Storage key inválida.",
      );
    }

    return key;
  }

  private isMissingFile(
    error: unknown,
  ): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (
        error as {
          code?: unknown;
        }
      ).code === "ENOENT"
    );
  }
}
