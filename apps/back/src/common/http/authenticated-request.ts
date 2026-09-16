import type {
  AuthPrincipal,
} from "../../auth/security.js";

export interface AuthenticatedRequest {
  headers:
    Record<
      string,
      string |
      string[] |
      undefined
    >;

  ip?:
    string;

  socket?: {
    remoteAddress?:
      string;
  };

  authPrincipal?:
    AuthPrincipal;
}