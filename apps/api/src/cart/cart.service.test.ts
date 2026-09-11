import { describe, expect, it, vi } from "vitest";
import type { AccessContextService } from "../common/authz/access-context.service.js";
import type { CartRepository } from "./cart.repository.js";
import { CartService } from "./cart.service.js";
const principal={userId:"30000000-0000-4000-8000-000000000001",email:"c@test",role:"CUSTOMER" as const,name:"C"}; const companyId="10000000-0000-0000-0000-000000000001";
const access=()=>({resolve:vi.fn().mockResolvedValue({userId:principal.userId,role:"CUSTOMER",storeId:null,companyId:null})} as unknown as AccessContextService);
const repo=(o:Partial<CartRepository>={})=>({getActiveCart:vi.fn().mockResolvedValue({id:null,status:"ACTIVE",items:[],totalItems:0,subtotal:0,currency:"BOB"}),findVariantForSale:vi.fn().mockResolvedValue({id:"60000000-0000-4000-8000-000000000001",companyId,variantActive:true,productActive:true}),addItem:vi.fn().mockResolvedValue({kind:"MAX_EXCEEDED"}),...o} as unknown as CartRepository);
describe("CartService company scope",()=>{it("rejects cross-company variant",async()=>{const s=new CartService(repo(),access()); await expect(s.addItem(principal,{companyId:"10000000-0000-0000-0000-000000000002",variantId:"60000000-0000-4000-8000-000000000001",quantity:1})).rejects.toMatchObject({status:409});}); it("forwards company on get",async()=>{const r=repo(); const s=new CartService(r,access()); await s.getCart(principal,companyId); expect(r.getActiveCart).toHaveBeenCalledWith(principal.userId,companyId);});});
