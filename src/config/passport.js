// src/config/passport.js

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { User, RecruiterProfile, CandidateProfile } from '../models/index.js';
import config from './index.js';
import logger from '../utils/logger.js';

// === 1. CHIẾN LƯỢC LOCAL (USERNAME/PASSWORD) ===
passport.use('local', new LocalStrategy(
    {
        usernameField: 'username', // Mặc định là 'username'
        passwordField: 'password'  // Mặc định là 'password'
    },
    async (username, password, done) => {
        try {
            const user = await User.findOne({ username }).select('+password');
            if (!user || !(await user.comparePassword(password))) {
                return done(null, false, { message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
            }
            if (!user.isEmailVerified) {
                return done(null, false, { message: 'Vui lòng xác thực email trước khi đăng nhập.' });
            }
            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }
));

// === 2. CHIẾN LƯỢC JWT (BẢO VỆ API) ===
passport.use('jwt', new JwtStrategy(
    {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
