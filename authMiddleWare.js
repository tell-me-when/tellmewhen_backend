/*
This file outlines the handling of authentication for JWT tokens.
 */
import { jwtVerify, importSPKI } from 'jose';
import fs from 'fs';
import { ROLES } from './constants/roles.js';
import { checkToken } from './blacklist.js';

const publicKeyPem = fs.readFileSync('jwtRSA256-public.pem','utf-8');
const publicKey = await importSPKI(publicKeyPem, 'RS256');

const authMiddleWare = async(req, res, next) => {
    //check that authorisation token is present in cookies
    if(req.cookies?.access){
        const token = req.cookies.access

        let payload;
        try{
            const verified = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });
            payload = verified.payload;
        }catch(err){
            return res.status(400).json({ message:`Unable to verify token: ${err}`})
        }

        // A valid signature isn't enough on its own — the token also has to
        // still be marked valid in TOKENS (logout / freezeUser revoke here).
        let stillValid;
        try{
            stillValid = await checkToken(token);
        }catch(err){
            return res.status(500).json({ message: `Unable to verify token status: ${err}` });
        }
        if(!stillValid){
            return res.status(401).json({ message: 'Token has been revoked, please sign in again' });
        }

        req.user = payload;
        next();
    }else{

        return res.status(401).json( {message:'No token provided'});

    }
}

// Lower role number = higher privilege. Returns middleware that only
// admits users whose role is at least as privileged as maxLevel.
const requireRole = (maxLevel) => (req, res, next) => {
    const role = req.user?.role; // role not privilige !
    if(role == null){
        return res.status(401).json({ message: "Unauthorized: No privilige level assigned"});
    }
    if(role <= maxLevel){
        next();
    }else{
        return res.status(401).json({ message: "Unauthorized: Invalid privilege level" });
    }
}

const adminMiddleWare = requireRole(ROLES.ADMIN);
const moderatorMiddleWare = requireRole(ROLES.MODERATOR);

export { authMiddleWare, moderatorMiddleWare, adminMiddleWare, requireRole};
