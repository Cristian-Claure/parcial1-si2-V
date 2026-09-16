import {
  Module,
} from "@nestjs/common";

import {
  RuntimeConfigModule,
} from "../common/config/runtime-config.module.js";

import {
  DatabaseService,
} from "./database.service.js";

@Module({
  imports: [
    RuntimeConfigModule,
  ],
  providers: [
    DatabaseService,
  ],
  exports: [
    DatabaseService,
  ],
})
export class DatabaseModule {}