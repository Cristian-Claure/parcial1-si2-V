import {
  Module,
} from "@nestjs/common";

import {
  ManagedAssetStorageService,
} from "./managed-asset-storage.service.js";

@Module({
  providers: [
    ManagedAssetStorageService,
  ],
  exports: [
    ManagedAssetStorageService,
  ],
})
export class StorageModule {}
