import { Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { CompanyResponse } from "@velora/contracts";
import { companies } from "@velora/database";
import { DatabaseService } from "../database/database.service.js";

const selection = {
  id: companies.id,
  code: companies.code,
  name: companies.name,
  description: companies.description,
  active: companies.active,
  createdAt: companies.createdAt,
  updatedAt: companies.updatedAt,
} as const;

@Injectable()
export class CompaniesRepository {
  constructor(private readonly database: DatabaseService) {}

  async listActive(): Promise<CompanyResponse[]> {
    const rows = await this.database.db.select(selection).from(companies)
      .where(eq(companies.active, true)).orderBy(asc(companies.name));
    return rows.map(this.map);
  }

  async listAll(): Promise<CompanyResponse[]> {
    const rows = await this.database.db.select(selection).from(companies).orderBy(asc(companies.name));
    return rows.map(this.map);
  }

  async findActive(id: string): Promise<CompanyResponse | null> {
    const rows = await this.database.db.select(selection).from(companies)
      .where(eq(companies.id, id)).limit(1);
    const row = rows[0];
    return row && row.active ? this.map(row) : null;
  }

  private map(row: {
    id: string; code: string; name: string; description: string | null; active: boolean; createdAt: Date; updatedAt: Date;
  }): CompanyResponse {
    return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
}
