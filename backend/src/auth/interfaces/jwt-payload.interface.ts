export interface JwtPayload {
  sub: string;
  email: string;
  phoneNumber: string;
  jti?: string;
}
