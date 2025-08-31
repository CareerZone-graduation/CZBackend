// src/config/passport.js

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { User, RecruiterProfile, CandidateProfile } from '../models/index.js';
import config from './index.js';
import logger from '../utils/logger.js';

// === 1. CHIẾN LƯỢC LOCAL (EMAIL/PASSWORD) ===
// Login with email only
passport.use('local', new LocalStrategy(
    {
        usernameField: 'email', 
        passwordField: 'password',
        passReqToCallback: true // Pass the req object to the callback
    },
    async (req, email, password, done) => {
        logger.info(req.body, 'Local authentication attempt');
        try {
            // Find user by email only
            const user = await User.findOne({ email: email }).select('+password');

            if (!user || !(await user.comparePassword(password))) {
                return done(null, false, { message: 'Email hoặc mật khẩu không chính xác.' });
            }
            // if (!user.isEmailVerified) {
            //     return done(null, false, { message: 'Vui lòng xác thực email trước khi đăng nhập.' });
            // }
            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }
));

// Custom extractor to debug potential header issues
const cookieExtractor = (req) => {
    let token = null;
    if (req && req.headers.authorization) {
        // Standard Bearer token
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }
    // Fallback to cookies if needed, though not used in this test
    if (!token && req && req.cookies) {
        token = req.cookies['accessToken'];
    }
    return token;
};

// === 2. CHIẾN LƯỢC JWT (BẢO VỆ API) ===
passport.use('jwt', new JwtStrategy(
    {
        jwtFromRequest: cookieExtractor,
        secretOrKey: config.JWT_SECRET,
    },
    async (jwt_payload, done) => {
        try {
            const user = await User.findById(jwt_payload.id);
            if (user && user.active) {
                return done(null, user);
            }
            return done(null, false);
        } catch (error) {
            return done(error, false);
        }
    }
));


export default passport;
