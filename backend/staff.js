const db = require('./db/db');
const noblox = require('noblox.js');
const bcrypt = require('bcrypt');
const _ = require('lodash');
const express = require('express');
const router = express.Router();

let activews = [];

const erouter = (usernames, pfps, settings, permissions) => {
    let perms = permissions.perms;
    router.get('/gmembers', perms('manage_staff_activity'), async (req, res) => {
        if (!req.query.role) {
            res.status(200).json({ message: 'No role specified' });
            return;
        }
        let role = await noblox.getRole(settings.get('group'), parseInt(req.query.role)).catch(err => {
            res.status(400).json({ message: 'No such role!' })
            return null;
        });
        if (!role) return;
        let members = await noblox.getPlayers(settings.get('group'), role.id).catch(err => res.status(500).json({ message: 'Server error!' }));;
        let mx = await Promise.all(members.map(async m => {
            m.pfp = await fetchpfp(m.userId);
            m.selected = false;

            let sessions = await db.session.find({ uid: m.userId, active: false });
            sessions = [...sessions].map(e => {
                let time;
                if (!e.mins) {
                    const d2 = new Date(e.start);
                    const d1 = new Date(e.end);
                    const diffMs = d1.getTime() - d2.getTime();
                    const diffMins = (diffMs / 1000) / 60;
                    time = Math.round(diffMins);
                } else time = e.mins;
    
                return { ...e._doc, time: time, type: e.type || 'session' }
            });
            let ias = await db.ia.find({ uid: m.userId })
            ias = [...ias].map(e => {
                return { ...e._doc, type: 'IA' }
            })
            let d = [...sessions, ...ias].sort((a, b) => b.start - a.start);

            const conv = (mins) => {
                return `${String(Math.floor(mins / 60)).padStart(1, '0')} hours, ${String(mins % 60).padStart(1, '0')} minutes`;
              }

            m.time = conv(Math.round(_.sumBy(sessions, 'time')));

            return m;
        }));

        res.status(200).json({ members: await mx });
    });

    router.get('/uprofile/:user', perms('manage_staff_activity'), async (req, res) => {

        let user = parseInt(req.params.user);
        let ruser;
        try {
             ruser = await noblox.getPlayerInfo(user)
        } catch(e) {
            return res.status(400).json({ message: 'No such user!' })
        }

        res.status(200).json({
            username: ruser.username,
            info: ruser,
            pfp: await fetchpfp(user),
        })
    })

    router.get('/pactivity/:user', perms('manage_staff_activity'),  async (req, res) => {
        let userid = parseInt(req.params.user);

        if (!userid) return res.status(401).json({ message: 'Get out!' });
        let sessions = await db.session.find({ uid: userid, active: false });
        sessions = [...sessions].map(e => {
            let time;
            if (!e.mins) {
                const d2 = new Date(e.start);
                const d1 = new Date(e.end);
                const diffMs = d1.getTime() - d2.getTime();
                const diffMins = (diffMs / 1000) / 60;
                time = Math.round(diffMins);
            } else time = e.mins;

            return { ...e._doc, time: time, type: e.type || 'session' }
        });
        let ias = await db.ia.find({ uid: userid })
        ias = [...ias].map(e => {
            return { ...e._doc, type: 'IA' }
        })
        let d = [...sessions, ...ias].sort((a, b) => b.start - a.start);



        res.status(200).json({ sessions: d, stats: {
            ia: ias.length,
            session: sessions.length,
            mins: Math.round(_.sumBy(sessions, 'time'))
        } });
    });



    router.post('/mactivity/change',perms('manage_staff_activity'),  async (req, res) => {
        if (!req.body?.mins) return res.status(400).json({ success: false, message: 'No minutes provides' });
        if (!req.body?.type) return res.status(400).json({ success: false, message: 'No type provides' });
        if (typeof req.body.mins !== 'number') return res.status(400).json({ success: false, message: 'Minutes must be a number' });

        let mins = req.body.mins;
        let type = req.body.type;

        if (!mins) return res.status(400).json({ message: 'No minutes specified' });
        if (type !== 'remove' && type !== 'add') return res.status(400).json({ message: 'Invalid type' });
        req.body.users.forEach(async u => {
            await db.session.create({
                active: false,
                mins: req.body.type === 'remove' ? -mins : mins,
                uid: u,
                start: new Date(),
                type: req.body.type
            })
        });

        res.status(200).json({ message: 'Successfully changed activity' });
    })

    router.post('/mactivity/reset', perms('manage_staff_activity'), async (req, res) => {
        
        req.body.users.forEach(async u => {
            await db.session.deleteMany({ active: false, uid: parseInt(u) });
        });

        res.status(200).json({ message: 'Successfully changed activity' });
    })

    async function fetchusername(uid) {
        if (usernames.get(uid)) {
            return usernames.get(uid);
        }
        let userinfo = await noblox.getUsernameFromId(uid);
        usernames.set(parseInt(uid), userinfo, 10000);

        return userinfo;
    }

    function chooseRandom(arr, num) {
        const res = [];
        for (let i = 0; i < num;) {
            const random = Math.floor(Math.random() * arr.length);
            if (res.indexOf(arr[random]) !== -1) {
                continue;
            };
            res.push(arr[random]);
            i++;
        };
        return res;
    }

    async function fetchpfp(uid) {
        if (pfps.get(uid)) {
            return pfps.get(uid);
        }
        let pfp = await noblox.getPlayerThumbnail({ userIds: uid, cropType: "headshot" }).catch(err => null);
        if (!pfp) return null;
        pfps.set(parseInt(uid), pfp[0].imageUrl, 10000);

        return pfp[0].imageUrl
    }


    return router;
}

module.exports = erouter;
