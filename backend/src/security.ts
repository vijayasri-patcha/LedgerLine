import jwt from 'jsonwebtoken'; import {randomBytes,createHash} from 'node:crypto'; import {config} from './config.js';
export const hashToken=(s:string)=>createHash('sha256').update(s).digest('hex');
export const newRefresh=()=>randomBytes(48).toString('base64url');
export const signAccess=(user:{id:string;role:string;name:string;email:string},sid:string)=>jwt.sign({sub:user.id,sid},config.jwtSecret,{expiresIn:'15m',issuer:config.issuer,audience:config.audience});
export function verifyAccess(token:string){return jwt.verify(token,config.jwtSecret,{issuer:config.issuer,audience:config.audience}) as jwt.JwtPayload;}
export const cookieOptions=()=>({httpOnly:true,secure:config.cookieSecure,sameSite:'strict' as const,path:'/api/v1/auth',maxAge:7*24*60*60*1000});
