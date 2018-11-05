//#region CONSTANT DECLARE AND LIBRARY
const line = require('@line/bot-sdk');
const express = require('express');
const { Client } = require('pg');
const _ = require('lodash');
const _class = require('./class.json');
const _message = require('./message.json');
var _rooms = [];
var _lockedUsers = [];
var classCarousel = [];
const errDBMessage = [{
    type: 'text',
    text: 'Maaf, tidak bisa mengakses database.\nCoba lagi nanti, atau hubungi developer.'
}];
//#endregion

//#region CONSTANT INSTANCING FOR PG, EXPRESS, AND LINEAPI
const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: true,
});
dbClient.connect().then(db => {
        console.log('connected to database');
    dbClient.query('CREATE TABLE IF NOT EXISTS PlayerStats (playerId text, displayName text, class smallint);');
    dbClient.query('CREATE TABLE IF NOT EXISTS PlayerFAQ (playerName text, messages text);');
        _rooms = [];
        _lockedUsers = [];
}).catch(err => console.error('error connecting', err.stack));
const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);
const app = express();
//#endregion

//#region WEB GET (FOR WEBSITE) AND POST (FOR WEBHOOKS)
app.get('/', (req, res) => {
    res.send('There\'s nothing here...');
    res.send(404);
});
app.post('/webhook', line.middleware(config), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((error) => {
            console.error(`Promise error ${error}`);
        });
});
//#endregion

//#region MESSAGE REPLY CONSTANT
//for every object that passed from const json, use this to create new object from its copy
function newJSON(object) {
    return JSON.parse(JSON.stringify(object));
}
//dont forget to add with CONCAT or it'll be read as 1 array
function getClassList() {
    if (classCarousel.length != 0)
        return classCarousel;
    classCarousel.push(getMessageJson('Silahkan pilih class yang kamu inginkan'));
    var classMsg;
    var classTempMsg;
    for (var i = 0; i < _class.length / 10; i++){
        classTempMsg = newJSON(_message.classCarousel);
        for(var j = i*10; j < (i+1)*10; j++){
            if(j >= _class.length)
                break;
            classMsg = newJSON(_message.classTemplate);
            classMsg.text = _class[j].name + '\n-----\n' + _class[j].shortDesc + '\nHP: ' + _class[j].HP.toString();
            classMsg.actions[0].text += j.toString();
            classTempMsg.template.columns.push(classMsg);
        }
        classCarousel.push(classTempMsg);
    }
    return classCarousel;
}
function getMessageJson(message) {
    const cMsg = newJSON(_message.simpleText);
    cMsg.text = message;
    return cMsg;
}
function getInvitationMessage(gamemode){
    var invMessage = _message.roomInvitation;
    invMessage.altText = 'Undangan bermain ' + gamemode;
    invMessage.template.actions[0].label = 'Join ' + gamemode;
    invMessage.template.actions[0].text = '!join' + gamemode.toLowerCase();
    invMessage.template.text = `Permainan dengan mode ${gamemode} berhasil dibuat. Tekan tombol ini atau ketik '!join${gamemode.toLowerCase()}' untuk gabung.\nRoom akan dibatalkan jika tidak cukup pemain dalam 1 menit.`;
    return invMessage;
}
function getSkillList(userIdx, roomIdx) {
    var skillList = [];
    skillList.push(getMessageJson(`Kamu mendapat giliran di room #${roomIdx}.\nSilahkan pilih skill yang kamu inginkan`));
    var skillMsg;
    var skillTempMsg;
    var classId = _rooms[roomIdx].users[userIdx].class;
    var skillUsage = _rooms[roomIdx].users[userIdx].skillUsage;
    var skillJSON = _class[classId].skill;
    for (var i = 0; i < skillJSON.length / 10; i++) {
        skillTempMsg = newJSON(_message.classCarousel);
        skillTempMsg.altText = "Skill list";
        for (var j = i * 10; j < (i + 1) * 10; j++) {
            if (j >= skillJSON.length)
                break;
            skillMsg = newJSON(_message.skillTemplate);
            skillMsg.text = skillJSON[j].sName + '\n-----\n' + skillJSON[j].shortDesc + '\nSisa Pakai: ' + (skillUsage[j] < 0 ? 'Tak Terbatas' : skillUsage[j]);
            if (skillUsage[j] == 0) {
                skillMsg.actions[0].data = 'hal&o';
                skillMsg.actions[0].label = 'Sudah Habis';
            } else
                skillMsg.actions[0].data = 'castskill&' + roomIdx.toString() + '&' + _rooms[roomIdx].users[userIdx].userId + '&' + classId.toString() + '&' + j.toString();
            skillTempMsg.template.columns.push(skillMsg);
        }
        skillList.push(skillTempMsg);
    }
    return skillList;
}
function getEnemySkillList(roomIdx, suffixData, ...datas) {
    var skillList = [];
    var skillMsg;
    var skillTempMsg;
    var userIdx = getEnemyIndex(roomIdx);
    var classId = _rooms[roomIdx].users[userIdx].class;
    var turnIdx = _rooms[roomIdx].turnId;
    var skillUsage = _rooms[roomIdx].users[userIdx].skillUsage;
    var skillJSON = _class[classId].skill;
    for (var i = 0; i < skillJSON.length / 10; i++) {
        skillTempMsg = newJSON(_message.classCarousel);
        skillTempMsg.altText = "Skill list";
        for (var j = i * 10; j < (i + 1) * 10; j++) {
            if (j >= skillJSON.length)
                break;
            skillMsg = newJSON(_message.skillTemplate);
            skillMsg.text = skillJSON[j].sName + '\n-----\n' + skillJSON[j].shortDesc + '\nSisa Pakai: ' + (skillUsage[j] < 0 ? 'Tak Terbatas' : skillUsage[j]);
            if (skillUsage[j] < 1) {
                skillMsg.actions[0].data = 'hal&o';
                skillMsg.actions[0].label = 'Tidak bisa';
            } else {
                skillMsg.actions[0].data = suffixData + '&' + roomIdx.toString() + '&' + _rooms[roomIdx].turn + '&' + _rooms[roomIdx].users[turnIdx].class.toString() + '&' + j.toString() + '&' + _rooms[roomIdx].users[userIdx].class.toString();
                for (var k = 0; k < datas.length; k++) {
                    skillMsg.actions[0].data += '&' + datas[k];
                }
            }
            skillTempMsg.template.columns.push(skillMsg);
        }
        skillList.push(skillTempMsg);
    }
    return skillList;
}
//#endregion =============

//#region ROOM STATIC FUNCTION
//DONT USE THIS, USE getRoomTimeout INSTEAD
function roomTimeout(source) {
    var roomId = getRoomId(source);
    deleteRoomNoReply(source);
    client.pushMessage(roomId, getMessageJson('Permainan diberhentikan karena tak cukup pemain.'));
}
function getRoomTimeout(sources) {
    return setTimeout(roomTimeout, 60000, sources);
}
function getRoomIndexWithID(_roomID){
    return _.findIndex(_rooms, (o) => {
        if (o == null) return false;
        return o.roomId == _roomID;
    });
}
function getRoomIndexWithSource(_source){
    let a = getRoomId(_source);
    return getRoomIndexWithID(a);
}
function getRoomId(sources) {
    if (sources.type === 'room')
        return sources.roomId;
    else
        return sources.groupId;
}
function isRoomExist(roomID) {
    if(getRoomIndexWithID(roomID) == -1)
        return false;
    else
        return true;
}
//#endregion =============

//#region USER STATIC FUNCTION
function isUserRegistered(userID) {
    return dbClient.query(`SELECT * FROM PlayerStats WHERE playerId = '${userID}'`);
}
function isUserInRoom(roomIdx, userID){
    if(_.findIndex(_rooms[roomIdx].users, (o) => {
        return o.userId == userID;
    }) == -1)
        return false;
    else
        return true;
}
function isUserLocked(userID) {
    if (_.indexOf(_lockedUsers, userID) == -1)
        return false;
    else
        return true;
}
function getUserIndexInRoom(roomIDX, userID) {
    return _.findIndex(_rooms[roomIDX].users, (o) => {
        return o.userId == userID;
    });
}
function getDisplayName(roomIDX, userIDX) {
    return _rooms[roomIDX].users[userIDX].displayName;
}
//#endregion =============

//#region GAMEPLAY FUNCTION
function getSkillUsage(roomIdx, userIdx, skillIdx) {
    return _rooms[roomIdx].users[userIdx].skillUsage[skillIdx];
}
function longRespondTimeout(roomIdx) {
    client.pushMessage(_rooms[roomIdx].roomId, getMessageJson('Permainan otomatis diberhentikan karena melebihi batas waktu jawaban (Time Limit Exceeded)'));
    deleteRoomIdxNoReply(roomIdx);
}
function getLongRespondTimeout(_roomIdx) {
    return setTimeout(longRespondTimeout, 300000, _roomIdx);
}
function skillNoRespondTimeout(roomIdx) {
    var resp = [];
    resp.push(getMessageJson('Batas waktu memilih skill sudah berakhir'));
    resp.push(applyEffectAndPoison(roomIdx, 0));
    resp.push(getMatchStatus(roomIdx));
    client.pushMessage(_rooms[roomIdx].roomId, resp).then(() => {
        decideNextTurn(roomIdx);
    });
}
function getSkillRespondTimeout(_roomIdx) {
    return setTimeout(skillNoRespondTimeout, 60000, _roomIdx);
}
function actionTimeout(roomIdx) {
    client.pushMessage(_rooms[roomIdx].roomId, getMessageJson('ACTION')).then(() => {
        _rooms[roomIdx].timeout = getLongRespondTimeout(roomIdx);
        _rooms[roomIdx].turn = 'attack';
    });
}
function pushMessageActionRoom(roomIdx, message) {
    client.pushMessage(_rooms[roomIdx].roomId, getMessageJson(message));
    _rooms[roomIdx].timeout = setTimeout(actionTimeout, 5000, roomIdx);
}
function getActionTimeout(source) {
    var roomIDX = getRoomIndexWithSource(source);
    _rooms[roomIDX].turn = '';
    return setTimeout(pushMessageActionRoom, 25000, roomIDX, '5 detik lagi permainan dimulai.\nBersiap-siap..');
}
function getActionTimeoutIdx(roomIdx) {
    _rooms[roomIdx].turn = '';
    return setTimeout(pushMessageActionRoom, 25000, roomIdx, '5 detik lagi permainan dimulai.\nBersiap-siap..');
}
function checkAction(_replyToken, _source) {
    var roomIdx = getRoomIndexWithSource(_source);
    if (roomIdx == -1)
        return;
    if (_rooms[roomIdx].turn == 'attack') {
        _rooms[roomIdx].turn = _source.userId;
        client.replyMessage(_replyToken, getMessageJson(`Selamat, ${_rooms[roomIdx].users[getUserIndexInRoom(roomIdx, _source.userId)].displayName} mendapatkan giliran sekarang. Silahkan pilih skill di private chat dengan bot.\nBatas memilih skill ialah 1 menit, jika melebihi batas waktu, maka giliran dibatalkan`)).then(() => {
            _rooms[roomIdx].turnId = getUserIndexInRoom(roomIdx, _source.userId);
            clearTimeout(_rooms[roomIdx].timeout);
            _rooms[roomIdx].timeout = getSkillRespondTimeout(roomIdx);
            pushSkillMessage(_rooms[roomIdx].turnId, roomIdx);
        });
    }
}
function decideNextTurn(roomIdx) {
    _rooms[roomIdx].turnAmount -= 1;
    var endGame = false;
    var deadPerson = -1;
    var draw = false;
    for (var i = 0; i < 2; i++) {
        if (_rooms[roomIdx].users[i].health <= 0) {
            endGame = true;
            if (deadPerson == 0)
                draw = true;
            deadPerson = i;
        }
    }
    if (endGame) {
        if (draw) {
            client.pushMessage(_rooms[roomIdx].roomId, getMessageJson('Permainan selesai dengan hasil DRAW!\nSilahkan mulai permainan baru dengan ketik \'!playpvp\''));
        } else {
            client.pushMessage(_rooms[roomIdx].roomId, getMessageJson(`Permainan selesai! ${_rooms[roomIdx].users[(deadPerson == 1 ? 0 : 1)].displayName} adalah pemenangnya!\nSilahkan mulai permainan baru dengan ketik \'playpvp\'`));
        }
        deleteRoomIdxNoReply(roomIdx);
    } else {
        if (_rooms[roomIdx].turnAmount < 1) {
            clearTimeout(_rooms[roomIdx].timeout);
            _rooms[roomIdx].turnId = -1;
            _rooms[roomIdx].turn = '';
            _rooms[roomIdx].turnAmount = 1;
            _rooms[roomIdx].timeout = getActionTimeoutIdx(roomIdx);
            client.pushMessage(_rooms[roomIdx].roomId, getMessageJson(`Permainan selanjutnya akan dimulai dalam 30 detik...`));
        } else {
            clearTimeout(_rooms[roomIdx].timeout);
            _rooms[roomIdx].timeout = getSkillRespondTimeout(roomIdx);
            client.pushMessage(_rooms[roomIdx].roomId, getMessageJson(`${_rooms[roomIdx].users[_rooms[roomIdx].turnId].displayName} masih punya giliran! Silahkan pilih skill di private chat dengan bot.\nBatas memilih skill ialah 1 menit, jika melebihi batas waktu, maka giliran dibatalkan.`));
            pushSkillMessage(_rooms[roomIdx].turnId, roomIdx);
        }
    }
}
function getMatchStatus(roomIdx) {
    var respond;
    var message = `Status Pemain`;
    for (var i = 0; i < 2; i++) {
        var userData = _rooms[roomIdx].users[i];
        message += `\n=====\n${userData.displayName}\nHP: ${userData.health}\nA. Buff: `;
        var effect;
        var len;
        effect = userData.effect[0].split(';');
        len = effect.length;
        for (var j = 0; j < effect.length; j++) {
            var code = effect[j].substring(0, 2);
            switch (code) {
                case 'AU':
                    var b = effect[j].substring(2, effect[j].length).split(',');
                    message += `\n> Attack Up - Menambah serangan sebesar ${b[0]}% (${b[1]} Turn)`;
                    break;
                case 'ED':
                    var b = effect[j].substring(2, effect[j].length).split(',');
                    message += `\n> Shield - Hanya menerima ${b[0]}% dari serangan musuh (${b[1]} Turn)`;
                    break;
                case 'HL':
                    var b = effect[j].substring(2, effect[j].length).split(',');
                    message += `\n> Heal Up - Menambah darah dari ${b[0]}% serangan musuh (${b[1]} Turn)`;
                    break;
            }
        }
        if (effect[0] == undefined)
            message += 'Tidak Ada';
        message += '\nB. Debuff:';
        effect = userData.effect[1].split(';');
        for (var j = 0; j < effect.length; j++) {
            var code = effect[j].substring(0, 2);
            switch (code) {
                case 'BA':
                    var b = effect[j].substring(2, effect[j].length).split(',');
                    message += `\n> Poison - Mengurangi darah sebesar ${-parseInt(b[0])} (${b[1]} Turn)`;
                    break;
                case 'BL':
                    var b = effect[j].substring(2, effect[j].length);
                    message += `\n> Blind - Membatalkan serangan (${b} Turn)`;
                    break;
            }
        }
        if (effect[0] == undefined)
            message += 'Tidak Ada';
    }
    respond = getMessageJson(message);
    return respond;
}
function applyEffectAndPoison(roomIdx, enemyDamage, ...args) {
    var respond;
    var userIdx = _rooms[roomIdx].turnId;
    var enemyIdx = getEnemyIndex(roomIdx);
    var message = `Debuff dan Effect\n=========\n`
    //if (enemyDamage = 0 (no skill select or special skill function) OR (enemyDamage != 0 (skill select) AND pureDamage = true (no stacked buff)))
    if (enemyDamage == 0 || (enemyDamage != 0 && args[0] == true)) {
        var pups = ``;
        var st;
        st = _rooms[roomIdx].users[userIdx].effect[1].split(';');
        for (var i = 0; i < st.length; i++) {
            var code = st[i].substring(0, 2);
            switch (code) {
                case 'BA': //Negative HP
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    _rooms[roomIdx].users[userIdx].health += parseInt(b[0]);
                    message += `> ${_rooms[roomIdx].users[userIdx].displayName} terkena efek 'Poison', mengurangi darahnya sebesar ${-parseInt(b[0])}. Tersisa ${val.toString()} turn lagi.\n`;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'BL':
                    var val = parseInt(st[i].substring(2, st[i].length));
                    val -= 1;
                    if (enemyDamage != 0) {
                        message += `> ${_rooms[roomIdx].users[userIdx].displayName} terkena efek 'Blind', membatalkan serangan ke ${_rooms[roomIdx].users[enemyIdx].displayName}!\n`;
                        enemyDamage = 0;
                    }
                    if (val != 0)
                        pups += code + val.toString() + ';';
                    break;
            }
        }
        pups = pups.substring(0, pups.length - 1);
        _rooms[roomIdx].users[userIdx].effect[1] = pups;
        pups = ``;
        st = _rooms[roomIdx].users[userIdx].effect[0].split(';');
        for (var i = 0; i < st.length; i++) {
            var code = st[i].substring(0, 2);
            switch (code) {
                case 'AU':
                    var b = st[i].substring(2, st[i].length).split(',');
                    if (enemyDamage != 0) {
                        var adder = Math.round(enemyDamage * (parseInt(b[0]) / 100));
                        enemyDamage += adder;
                        message += `> ${_rooms[roomIdx].users[userIdx].displayName} memakai 'Attack Up', menambah serangan sebesar ${(-adder).toString()}\n`;
                    }
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'HL':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'ED':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
            }
        }
        if (enemyDamage != 0) {
            _rooms[roomIdx].users[enemyIdx].health += enemyDamage;
            message += `> ${_rooms[roomIdx].users[enemyIdx].displayName} menerima serangan oleh ${_rooms[roomIdx].users[userIdx].displayName} sebesar ${-enemyDamage}!\n`;
        }
        pups = pups.substring(0, pups.length - 1);
        _rooms[roomIdx].users[userIdx].effect[0] = pups;
        pups = ``;
        //forEnemy
        st = _rooms[roomIdx].users[enemyIdx].effect[0].split(';');
        for (var i = 0; i < st.length; i++) {
            var code = st[i].substring(0, 2);
            switch (code) {
                case 'AU':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'HL':
                    var b = st[i].substring(2, st[i].length).split(',');
                    if (enemyDamage != 0) {
                        var adder = -Math.round(enemyDamage * (parseInt(b[0]) / 100));
                        _rooms[roomIdx].users[enemyIdx].health += adder;
                        message += `> ${_rooms[roomIdx].users[enemyIdx].displayName} memakai 'Heal Up', menambah darah dari serangan sebesar ${(adder)}\n`;
                    }
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'ED':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
            }
        }
        pups = pups.substring(0, pups.length - 1);
        _rooms[roomIdx].users[enemyIdx].effect[0] = pups;
        pups = ``;
        st = _rooms[roomIdx].users[enemyIdx].effect[1].split(';');
        for (var i = 0; i < st.length; i++) {
            var code = st[i].substring(0, 2);
            switch (code) {
                case 'BA':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    _rooms[roomIdx].users[enemyIdx].health += parseInt(b[0]);
                    message += `> ${_rooms[roomIdx].users[enemyIdx].displayName} terkena efek 'Poison', mengurangi darahnya sebesar ${-parseInt(b[0])}. Tersisa ${val.toString()} turn lagi.\n`;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'BL':
                    var val = parseInt(st[i].substring(2, st[i].length));
                    val -= 1;
                    if (val != 0)
                        pups += code + val.toString() + ';';
                    break;
            }
        }
        pups = pups.substring(0, pups.length - 1);
        _rooms[roomIdx].users[enemyIdx].effect[1] = pups;
        pups = ``;
    }
    else if (enemyDamage != 0 && args[0] == false) { //for enemyDamage included with NO pureDamage
        var pups = ``;
        var st;
        //debuff from player
        st = _rooms[roomIdx].users[userIdx].effect[1].split(';');
        for (var i = 0; i < st.length; i++) {
            var code = st[i].substring(0, 2);
            switch (code) {
                case 'BA': //Negative HP
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    _rooms[roomIdx].users[userIdx].health += parseInt(b[0]);
                    message += `> ${_rooms[roomIdx].users[userIdx].displayName} terkena efek 'Poison', mengurangi darahnya sebesar ${-parseInt(b[0])}. Tersisa ${val.toString()} turn lagi.\n`;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'BL':
                    var val = parseInt(st[i].substring(2, st[i].length));
                    val -= 1;
                    message += `> ${_rooms[roomIdx].users[userIdx].displayName} terkena efek 'Blind', membatalkan serangan ke ${_rooms[roomIdx].users[enemyIdx].displayName}!\n`;
                    enemyDamage = 0;
                    if (val != 0)
                        pups += code + val.toString() + ';';
                    break;
            }
        }
        pups = pups.substring(0, pups.length - 1);
        _rooms[roomIdx].users[userIdx].effect[1] = pups;
        pups = ``;
        //buff from player
        st = _rooms[roomIdx].users[userIdx].effect[0].split(';');
        for (var i = 0; i < st.length; i++) {
            var code = st[i].substring(0, 2);
            switch (code) {
                case 'AU':
                    var b = st[i].substring(2, st[i].length).split(',');
                    if (enemyDamage != 0) {
                        var adder = Math.round(enemyDamage * (parseInt(b[0]) / 100));
                        enemyDamage += adder;
                        message += `> ${_rooms[roomIdx].users[userIdx].displayName} memakai 'Attack Up', menambah serangan sebesar ${(-adder).toString()}\n`;
                    }
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'HL':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'ED':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
            }
        }
        pups = pups.substring(0, pups.length - 1);
        _rooms[roomIdx].users[userIdx].effect[0] = pups;
        pups = ``;
        //==================== ENEMY
        st = _rooms[roomIdx].users[enemyIdx].effect[0].split(';');
        for (var i = 0; i < st.length; i++) {
            var code = st[i].substring(0, 2);
            switch (code) {
                case 'AU':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'HL':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var adder = -Math.round(enemyDamage * (parseInt(b[0]) / 100));
                    _rooms[roomIdx].users[enemyIdx].health += adder;
                    message += `> ${_rooms[roomIdx].users[enemyIdx].displayName} memakai 'Heal Up', menambah darah dari serangan sebesar ${adder.toString()}\n`;
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'ED':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var shield = -Math.round(enemyDamage * ( (100 - parseInt(b[0])) / 100 ));
                    enemyDamage += shield;
                    message += `> ${_rooms[roomIdx].users[enemyIdx].displayName} memakai 'Shield', mengurangi serangan sebesar ${shield.toString()}\n`;
                    var val = parseInt(b[1]) - 1;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
            }
        }
        pups = pups.substring(0, pups.length - 1);
        _rooms[roomIdx].users[enemyIdx].effect[0] = pups;
        pups = ``;
        st = _rooms[roomIdx].users[enemyIdx].effect[1].split(';');
        for (var i = 0; i < st.length; i++) {
            var code = st[i].substring(0, 2);
            switch (code) {
                case 'BA':
                    var b = st[i].substring(2, st[i].length).split(',');
                    var val = parseInt(b[1]) - 1;
                    _rooms[roomIdx].users[enemyIdx].health += parseInt(b[0]);
                    message += `> ${_rooms[roomIdx].users[enemyIdx].displayName} terkena efek 'Poison', mengurangi darahnya sebesar ${-parseInt(b[0])}. Tersisa ${val.toString()} turn lagi.\n`;
                    if (val != 0)
                        pups += code + b[0] + ',' + val.toString() + ';';
                    break;
                case 'BL':
                    var val = parseInt(st[i].substring(2, st[i].length));
                    val -= 1;
                    if (val != 0)
                        pups += code + val.toString() + ';';
                    break;
            }
        }
        pups = pups.substring(0, pups.length - 1);
        _rooms[roomIdx].users[enemyIdx].effect[1] = pups;
        pups = ``;
        if (enemyDamage != 0) {
            _rooms[roomIdx].users[enemyIdx].health += enemyDamage;
            message += `> ${_rooms[roomIdx].users[enemyIdx].displayName} menerima serangan oleh ${_rooms[roomIdx].users[userIdx].displayName} sebesar ${-enemyDamage}!\n`;
        }
    }
    respond = getMessageJson(message);
    return respond;
}
function getEnemyIndex(roomIdx) {
    if (_rooms[roomIdx].turnId == 1)
        return 0;
    else
        return 1;
}
function castSkill(_replyToken, _source, _data) {
    var args = _data.split('&');
    var roomIdx = parseInt(args[1]);
    var userId = args[2];
    var classId = parseInt(args[3]);
    var skillIdx = parseInt(args[4]);
    if (_rooms[roomIdx] == undefined)
        return client.replyMessage(_replyToken, getMessageJson('Turn sudah tidak berlaku'));
    var userIdx = _rooms[roomIdx].turnId;
    var message = '';
    var userData = _rooms[roomIdx].users[userIdx];
    var enemyData = _rooms[roomIdx].users[getEnemyIndex(roomIdx)];
    if (_rooms[roomIdx].turn == userId && userData.class == classId) { //double protective, check for USERID and CLASS
        if (userData.skillUsage[skillIdx] == 0)
            return client.replyMessage(_replyToken, getMessageJson('Kekuatan sudah habis'));
        _rooms[roomIdx].users[userIdx].skillUsage[skillIdx]--;
        message = `> ${userData.displayName} memakai kekuatan ${_class[classId].skill[skillIdx].sName}!\n`;
        var enemyDamage = 0;
        var playerHPAdd = 0;
        var buff = '';
        var debuff = '';
        var st;
        var pureDamage = false;
        st = _class[classId].skill[skillIdx].effect.split(';');
        for (var i = 0; i < st.length; i++) {
            switch (st[i].substring(0, 2)) {
                case 'AT':
                    enemyDamage += parseInt(st[i].substring(2, st[i].length), 10);
                    break;
                case 'AP':
                    enemyDamage += Math.round(_rooms[roomIdx].users[getEnemyIndex(roomIdx)].health * (parseInt(st[i].substring(2, st[i].length), 10) / 100));
                    break;
                case 'HL':
                    _rooms[roomIdx].users[userIdx].effect[1] = '';
                    message += `> ${userData.displayName} membersihkan racun ditubuhnya!\n`;
                    break;
            }
        }
        st = _class[classId].skill[skillIdx].buff.split(';');
        for (var i = 0; i < st.length; i++) {
            switch (st[i].substring(0, 2)) {
                case 'HP':
                    var val = st[i].substring(2, st[i].length).split(',');
                    if (parseInt(val[1]) == 1) {
                        playerHPAdd += parseInt(val[0]);
                        message += `> ${userData.displayName} mendapatkan darah sebesar ${val[0]} HP\n`;
                    } else {
                        message += `> ${userData.displayName} mendapatkan debuff 'Poison', mengurangi darah sebesar ${(-parseInt(val[0])).toString()} selama ${val[1]}\n`;
                        if (_rooms[roomIdx].users[userIdx].effect[1].length == 0)
                            _rooms[roomIdx].users[userIdx].effect[1] = `${st[i]}`;
                        else
                            _rooms[roomIdx].users[userIdx].effect[1] = `;${st[i]}`;
                    }
                    break;
                case 'DP':
                    var ma = Math.round((parseInt(st[i].substring(2, st[i].length)) / 100) * userData.health);
                    playerHPAdd += ma;
                    message += `> ${userData.displayName} mengurangi darahnya sebesar ${Math.abs(ma)} HP\n`;
                    break;
                case 'AU':
                    var val = st[i].substring(2, st[i].length).split(',');
                    message += `> ${userData.displayName} mengaktifkan buff 'Attack Up', menambah serangan sebesar ${val[0]}% selama ${val[1]} turn!\n`;
                    buff += st[i] + ';';
                    break;
                case 'HL':
                    var val = st[i].substring(2, st[i].length).split(',');
                    message += `> ${userData.displayName} mengaktifkan buff 'Heal Up', menambah darah sebesar ${val[0]}% terhadap damage musuh selama ${val[1]} turn!\n`;
                    buff += st[i] + ';';
                    break;
                case 'ED':
                    var val = st[i].substring(2, st[i].length).split(',');
                    message += `> ${userData.displayName} mengaktifkan buff 'Shield', hanya menerima ${(100-parseInt(val[0]))}% damage musuh selama ${val[1]} turn!\n`;
                    buff += st[i] + ';';
                    break;

            }
        }
        st = _class[classId].skill[skillIdx].debuff.split(';');
        for (var i = 0; i < st.length; i++) {
            switch (st[i].substring(0, 2)) {
                case 'ST':
                    var val = parseInt(st[i].substring(2, st[i].length));
                    _rooms[roomIdx].turnAmount += val;
                    message += `> ${userData.displayName} membuat musuh membatu! ${val} giliran tambahan untuk ${userData.displayName}\n`;
                    break;
                case 'PD':
                    pureDamage = true;
                    message += `> ${userData.displayName} mengaktifkan 'Pure Damage', melumpuhkan 'Shield' musuh (jika ada)!\n`;
                    break;
                case 'BA':
                    var val = st[i].substring(2, st[i].length).split(',');
                    message += `> ${userData.displayName} mengaktifkan 'Poison', mengurangi darah ${enemyData.displayName} sebesar ${-parseInt(val[0])} selama ${val[1]} turn!\n`;
                    debuff += st[i] + ';';
                    break;
                case 'RH':
                    message += `> ${userData.displayName} mengeluarkan 'Reverse Health', mengganti darahnya (${userData.health}) dengan darah ${enemyData.displayName} (${enemyData.health})!\n`;
                    var bck = userData.health;
                    _rooms[roomIdx].users[userIdx].health = _rooms[roomIdx].users[getEnemyIndex(roomIdx)].health;
                    _rooms[roomIdx].users[getEnemyIndex(roomIdx)].health = bck;
                    break;
                case 'BL':
                    var val = parseInt(st[i].substring(2, st[i].length));
                    message += `> ${userData.displayName} mengaktifkan 'Blind', membutakan ${enemyData.displayName} sehingga tak dapat memberi damage`;
                    debuff += st[i] + ';';
                    break;
                case 'RA':
                    var val = parseInt(st[i].substring(2, st[i].length));
                    var respond = [];
                    respond.push(getMessageJson(`Pilih skill musuh yang ingin kamu kurangi usagenya`))
                    respond = respond.concat(getEnemySkillList(roomIdx, 'ra', '1'));
                    _rooms[roomIdx].users[userIdx].skillUsage[skillIdx]++;
                    return client.replyMessage(_replyToken, respond);
                    break;
                case 'RS':
                    var respond = [];
                    respond.push(getMessageJson(`Pilih skill musuh yang ingin kamu hapus`));
                    respond = respond.concat(getEnemySkillList(roomIdx, 'rs'));
                    _rooms[roomIdx].users[userIdx].skillUsage[skillIdx]++;
                    return client.replyMessage(_replyToken, respond);
                    break;
            }
        }
        _rooms[roomIdx].users[userIdx].health += playerHPAdd;
        var respond = [];
        respond.push(getMessageJson(message));
        respond.push(applyEffectAndPoison(roomIdx, enemyDamage, pureDamage));
        _rooms[roomIdx].users[userIdx].effect[0] += (_rooms[roomIdx].users[userIdx].effect[0].length < 3 ? '' : ';') + buff.substring(0, buff.length - 1);
        _rooms[roomIdx].users[getEnemyIndex(roomIdx)].effect[1] += (_rooms[roomIdx].users[getEnemyIndex(roomIdx)].effect[1].length < 3 ? '' : ';') + debuff.substring(0, debuff.length - 1);
        respond.push(getMatchStatus(roomIdx));
        client.pushMessage(_rooms[roomIdx].roomId, respond).then(() => {
            decideNextTurn(roomIdx);
        });
        return client.replyMessage(_replyToken, getMessageJson('Kekuatan berhasil dipakai!'));
    }
    return client.replyMessage(_replyToken, getMessageJson('Turn sudah tidak berlaku'));
}
function removeUsedSkill(_replyToken, _sources, _data) {
    var args = _data.split('&');
    var roomIdx = parseInt(args[1]);
    var userId = args[2];
    var classId = parseInt(args[3]);
    var skillIdx = parseInt(args[4]);
    var enemyClassId = parseInt(args[5]);
    var amount = parseInt(args[6]);
    if (_rooms[roomIdx].turnId == undefined)
        return client.replyMessage(_replyToken, getMessageJson('Turn sudah tidak berlaku'));
    var userIdx = _rooms[roomIdx].turnId;
    var message = ``;
    var enemyData = _rooms[roomIdx].users[getEnemyIndex(roomIdx)];
    if (_rooms[roomIdx].turn == userId && _rooms[roomIdx].users[userIdx].class == classId && enemyData.class == enemyClassId) {
        if (_rooms[roomIdx].users[userIdx].skillUsage[3] == 0)
            return client.replyMessage(_replyToken, getMessageJson('Kekuatan sudah habis'));
        _rooms[roomIdx].users[userIdx].skillUsage[3]--;
        message = `${_rooms[roomIdx].users[userIdx].displayName} memakai kekuatan 'Kutukan'!\n`;
        message += `${_rooms[roomIdx].users[userIdx].displayName} menghapus penggunaan kekuatan '${_class[enemyClassId].skill[skillIdx].sName}' dari ${enemyData.displayName} sebanyak ${amount}!\n`;
        var respond = [];
        _rooms[roomIdx].users[getEnemyIndex(roomIdx)].skillUsage[skillIdx]--;
        respond.push(getMessageJson(message));
        respond.push(applyEffectAndPoison(roomIdx, 0));
        respond.push(getMatchStatus(roomIdx));
        client.pushMessage(_rooms[roomIdx].roomId, respond).then(() => {
            decideNextTurn(roomIdx);
        });
        return client.replyMessage(_replyToken, getMessageJson('Kekuatan berhasil dipakai!'));
    }
    return client.replyMessage(_replyToken, getMessageJson('Turn sudah tidak berlaku'));
}
function removeSkill(_replyToken, _sources, _data) {
    var args = _data.split('&');
    var roomIdx = parseInt(args[1]);
    var userId = args[2];
    var classId = parseInt(args[3]);
    var skillIdx = parseInt(args[4]);
    var enemyClassId = parseInt(args[5]);
    var amount = parseInt(args[6]);
    if (_rooms[roomIdx].turnId == undefined)
        return client.replyMessage(_replyToken, getMessageJson('Turn sudah tidak berlaku'));
    var userIdx = _rooms[roomIdx].turnId;
    var message = ``;
    var enemyData = _rooms[roomIdx].users[getEnemyIndex(roomIdx)];
    if (_rooms[roomIdx].turn == userId && _rooms[roomIdx].users[userIdx].class == classId && enemyData.class == enemyClassId) {
        if (_rooms[roomIdx].users[userIdx].skillUsage[3] == 0)
            return client.replyMessage(_replyToken, getMessageJson('Kekuatan sudah habis'));
        _rooms[roomIdx].users[userIdx].skillUsage[3]--;
        message = `${_rooms[roomIdx].users[userIdx].displayName} memakai kekuatan 'Jeruji'!\n`;
        message += `${_rooms[roomIdx].users[userIdx].displayName} menghapus kekuatan '${_class[enemyClassId].skill[skillIdx].sName}' dari ${enemyData.displayName}!\n`;
        var respond = [];
        _rooms[roomIdx].users[getEnemyIndex(roomIdx)].skillUsage[skillIdx] = 0;
        respond.push(getMessageJson(message));
        respond.push(applyEffectAndPoison(roomIdx, 0));
        respond.push(getMatchStatus(roomIdx));
        client.pushMessage(_rooms[roomIdx].roomId, respond).then(() => {
            decideNextTurn(roomIdx);
        });
        return client.replyMessage(_replyToken, getMessageJson('Kekuatan berhasil dipakai!'));
    }
    return client.replyMessage(_replyToken, getMessageJson('Turn sudah tidak berlaku'));
}
function pushSkillMessage(userIdx, roomIdx) {
    client.pushMessage(_rooms[roomIdx].users[userIdx].userId, getSkillList(userIdx, roomIdx));
}
//#endregion

//#region MAIN FUNCTION
function joinRoom(_roomType, _source, _replyToken) {
    let roomId = getRoomId(_source);
    let roomIndex = getRoomIndexWithID(roomId);
    if(roomIndex == -1)
        return client.replyMessage(_replyToken, getMessageJson('Tidak ada permainan yang sedang berlangsung'));
    if(_roomType != _rooms[roomIndex].roomType)
        return client.replyMessage(_replyToken, getMessageJson('Room dengan gamemode yang ditujukan tidak ditemukan disini.'))
    var resp = [];
    isUserRegistered(_source.userId).then((res) => {
        if(res.rowCount > 0){
            if(_roomType == 0){
                if(isUserInRoom(roomIndex, _source.userId))
                    return client.replyMessage(_replyToken, getMessageJson(`${res.rows[0].displayname} sudah berada didalam room`));
                if (_rooms[roomIndex].users.length > 1)
                    return client.replyMessage(_replyToken, getMessageJson('Terdapat permainan sedang berlangsung disini. Tunggulah hingga selesai atau paksa permainan agar berhenti dengan \'!exit\'.'));
                var newUser = newJSON(_message.userPVPTemplate);
                newUser.userId = _source.userId;
                newUser.displayName = res.rows[0].displayname;
                newUser.class = res.rows[0].class;
                newUser.health = _class[newUser.class].HP;
                for (var i = 0; i < _class[newUser.class].skill.length; i++) {
                    if (_class[newUser.class].skill[i].usage == 0)
                        newUser.skillUsage.push(-1);
                    else
                        newUser.skillUsage.push(_class[newUser.class].skill[i].usage);
                }
                _lockedUsers.push(_source.userId);
                _rooms[roomIndex].users.push(newUser);
                if (_rooms[roomIndex].users.length > 1) {
                    clearTimeout(_rooms[roomIndex].timeout);
                    _rooms[roomIndex].timeout = getActionTimeout(_source);
                    resp.push(getMessageJson(`${res.rows[0].displayname} berhasil masuk kedalam room`));
                    resp.push(getMessageJson(`Pemain sudah cukup. Permainan akan dimulai 30 detik lagi. Setelah 30 detik, bot akan mengirim pesan 'ACTION' dan pemain harus menjawab dengan '!ACTION' (tanpa tanda kutip, wajib pakai tanda seru dan huruf kapital). Pemain tercepat akan mendapatkan giliran cast skill.`));
                    resp.push(getMessageJson('INGAT: Permainan ini TIDAK turn-based, dengan kata lain, bisa saja pemain yang sama mendapatkan 2 atau lebih giliran, selama pemain tersebut merupakan orang pertama yang menjawab bot'));
                    resp.push(getMessageJson('Selamat bermain!'));
                    resp.push(getMessageJson(`${_rooms[roomIndex].users[0].displayName} (${_class[_rooms[roomIndex].users[0].class].name}) [${_rooms[roomIndex].users[0].health} HP] vs ${newUser.displayName} (${_class[newUser.class].name}) [${newUser.health} HP]`));
                    return client.replyMessage(_replyToken, resp);
                }
                return client.replyMessage(_replyToken, getMessageJson(`${res.rows[0].displayname} berhasil masuk kedalam room`));
            }
        } else {
            return client.replyMessage(_replyToken, getMessageJson('Kamu belum menambahkan bot sebagai teman atau belum mendaftar dan memilih class.'));
        }
    });
}
function createRoom(_roomType, _source, _replyToken) {
    let roomId = getRoomId(_source);
    let roomIndex = getRoomIndexWithID(roomId);
    if(roomIndex != -1)
        return client.replyMessage(_replyToken, getMessageJson('Sudah ada room tersedia disini'));
    if (_roomType == 0) {
        let newRoom = newJSON(_message.roomTemplate);
        newRoom.roomId = roomId;
        newRoom.roomType = _roomType;
        newRoom.timeout = getRoomTimeout(_source);
        var pushnew = true;
        for (var i = 0; i < _rooms.length; i++) {
            if (_rooms[i] == null) {
                _rooms[i] = newRoom;
                pushnew = false;
                break;
            }
        }
        if (pushnew)
            _rooms.push(newRoom);
        return client.replyMessage(_replyToken, getInvitationMessage('PvP'));
    }
}
function deleteRoom(_source, _replyToken) {
    var roomId = getRoomId(_source);
    var roomIndex = getRoomIndexWithID(roomId);
    if(roomIndex != -1){
        if (isUserInRoom(roomIndex, _source.userId)) {
            var idx = 0;
            for (var i = 0; i < _rooms[roomIndex].users.length; i++) {
                idx = _.indexOf(_lockedUsers, _rooms[roomIndex].users[i].userId);
                if(idx != -1)
                    _lockedUsers.splice(idx, 1);
            }
            clearTimeout(_rooms[roomIndex].timeout);
            _rooms[roomIndex] = null;
            return client.replyMessage(_replyToken, getMessageJson('Permainan diberhentikan'));
        } else {
            return client.replyMessage(_replyToken, getMessageJson('Kamu bukan merupakan anggota permainan'));
        }
    } else {
        return client.replyMessage(_replyToken, getMessageJson('Tidak ada permainan yang sedang berlangsung'));
    }
}
function deleteRoomNoReply(_source) {
    var roomId = getRoomId(_source);
    var roomIndex = getRoomIndexWithID(roomId);
    if (roomIndex != -1) {
        var idx = 0;
        for (var i = 0; i < _rooms[roomIndex].users.length; i++) {
            idx = _.indexOf(_lockedUsers, _rooms[roomIndex].users[i].userId);
            if (idx != -1)
                _lockedUsers.splice(idx, 1);
        }
        clearTimeout(_rooms[roomIndex].timeout);
        _rooms[roomIndex] = null;
    }
}
function deleteRoomIdxNoReply(roomIndex) {
    var idx = 0;
    for (var i = 0; i < _rooms[roomIndex].users.length; i++) {
        idx = _.indexOf(_lockedUsers, _rooms[roomIndex].users[i].userId);
        if (idx != -1)
            _lockedUsers.splice(idx, 1);
    }
    clearTimeout(_rooms[roomIndex].timeout);
    _rooms[roomIndex] = null;
}
function roomPlayerList(_source, _replyToken) {
    const roomId = getRoomId(_source);
    let roomIndex = getRoomIndexWithID(roomId);
    if (roomIndex != -1) {
        if (_rooms[roomIndex].users.length < 1) {
            return client.replyMessage(_replyToken, getMessageJson('Tidak ada pemain yang masuk kedalam room'));
        } else {
            const resp = _message.simpleText;
            resp.text = "Daftar pemain yang masuk kedalam room\n============";
            for (var i = 0; i < _rooms[roomIndex].users.length; i++) {
                resp.text += `\n${i + 1}. ${_rooms[roomIndex].users[i].displayName} (${_class[_rooms[roomIndex].users[i].class].name}) [${_rooms[roomIndex].users[i].health}]`;
            }
            return client.replyMessage(_replyToken, resp);
        }
    } else {
        return client.replyMessage(_replyToken, getMessageJson('Tidak ada permainan yang sedang berlangsung'));
    }
}
//#endregion =============

//#region CORE FUNCTION AND COMMANDS HANDLING
function handleEvent(event) {
    var respond;
    if (event.type === 'follow') {
        isUserRegistered(event.source.userId).then((res) => {
            if (res.rowCount > 0)
                return;
            respond = [];
            respond.push(getMessageJson('Terimakasih telah menambahkan aku menjadi teman!'));
            respond.push(getMessageJson(`Sebelum bermain, kamu harus mendaftar dan memilih Class yang dipakai dalam bermain\nClass dan nama dapat diganti kapanpun dengan command '!edit class' untuk mengganti class dan '!edit name <namamu>' untuk mengganti nama`));
            respond = respond.concat(getClassList());
            return client.replyMessage(event.replyToken, respond);
        });
        respond = null;
    } else if (event.type === 'join') {
        return client.replyMessage(event.replyToken, getMessageJson(`Terimakasih telah menambahkanku di ${event.source.type} ini!\nUntuk memulai permainan, ketik !playpvp\nUntuk melihat perintah yang lain, ketik !commands`));
    } else if (event.type === 'leave') {
        if (isRoomExist(getRoomId(event.source)))
            deleteRoomNoReply(event.source);
    } else if (event.type === 'postback') {
        var args = event.postback.data.split('&');
        switch (args[0]) {
            case 'castskill':
                castSkill(event.replyToken, event.source, event.postback.data);
                break;
            case 'ra':
                removeUsedSkill(event.replyToken, event.source, event.postback.data);
                break;
            case 'rs':
                removeSkill(event.replyToken, event.source, event.postback.data);
                break;
        }
        respond = null;
    }
    if (event.type !== 'message' || event.message.type !== 'text') {
        // ignore non-text-message event
        return Promise.resolve(null);
    }
    if (event.message.text.substring(0, 1) == "!") {
        var args = event.message.text.substring(1).split(' ');
        var cmd = args[0];
        switch (cmd) {
            case 'kick':
                switch (event.source.type) {
                    case 'room':
                        client.leaveRoom(event.source.roomId);
                        break;
                    case 'group':
                        client.leaveGroup(event.source.groupId);
                        break;
                }
                break;
            case 'ACTION':
                if (event.source.type !== 'user') {
                    checkAction(event.replyToken, event.source);
                    respond = null;
                }
                break;
            case 'saran':
                if (event.source.type === 'user') {
                    if (args[1] == undefined || args[1] == '') {
                        return client.replyMessage(event.replyToken, getMessageJson('Pesan kamu tidak valid (argumen pesan tidak ada atau kosong)'));
                    }
                    isUserRegistered(event.source.userId).then((res) => {
                        if (res.rowCount > 0) {
                            var msg = args[1];
                            for (var i = 2; i < args.length; i++) {
                                msg += ' ' + args[i];
                            }
                            dbClient.query(`INSERT INTO PlayerFAQ (playerName, messages) VALUES ('${res.rows[0].displayname.replace(/'/g, "''")}', '${msg.replace(/'/g, "''")}')`).then(() => {
                                return client.replyMessage(event.replyToken, getMessageJson('Terimakasih atas sarannya!'));
                            }).catch((err) => {
                                console.log(err);
                                return client.replyMessage(event.replyToken, errDBMessage);
                            });
                        }
                    });
                    respond = null;
                }
                break;
            case 'playpvp':
                if (event.source.type !== 'user') {
                    createRoom(0, event.source, event.replyToken);
                    respond = null;
                }
                break;
            case 'joinpvp':
                if (event.source.type !== 'user') {
                    joinRoom(0, event.source, event.replyToken);
                    respond = null;
                }
                break;
            case 'exit':
                if (event.source.type !== 'user') {
                    deleteRoom(event.source, event.replyToken);
                    respond = null;
                }
                break;
            case 'player':
                if (event.source.type !== 'user') {
                    roomPlayerList(event.source, event.replyToken);
                    respond = null;
                }
                break;
            case 'edit':
                if (event.source.type === 'user') {
                    if (isUserLocked(event.source.userId)) {
                        return client.replyMessage(event.replyToken, getMessageJson('Kamu sedang dalam permainan. Selesaikan atau berhentikan permainan terlebih dahulu untuk mengubah profil'));
                    }
                    switch (args[1]) {
                        case 'class':
                            if (args[2] !== undefined && parseInt(args[2]) < _class.length) {
                                //Set class
                                isUserRegistered(event.source.userId)
                                    .then((res) => {
                                        if (res.rowCount > 0) {
                                            dbClient.query(`UPDATE PlayerStats SET class = ${args[2]} WHERE playerId = '${event.source.userId}';`)
                                                .then(() => {
                                                    return client.replyMessage(event.replyToken, getMessageJson('Class kamu sudah diperbarui. Silahkan lihat daftar skill yang tersedia dengan !info skill'));
                                                })
                                                .catch((err) => {
                                                    console.log(err);
                                                    return client.replyMessage(event.replyToken, errDBMessage);
                                                });
                                        } else {
                                            client.getProfile(event.source.userId).then((res) => {
                                                dbClient.query(`INSERT INTO PlayerStats (playerId, displayName, class) VALUES ('${event.source.userId}', '${res.displayName.replace(/'/g, "''")}', ${args[2]});`)
                                                    .then(() => {
                                                        return client.replyMessage(event.replyToken, getMessageJson('Kamu berhasil mendaftar dan menetapkan class.\nUbah namamu dengan \'!edit name <namamu>\'\nLihat daftar skill yang tersedia dengan !info skill'));
                                                    })
                                                    .catch((err) => {
                                                        console.log(err);
                                                        return client.replyMessage(event.replyToken, errDBMessage);
                                                    });
                                            });
                                        }
                                    })
                                    .catch((err) => {
                                        console.log(err);
                                        return client.replyMessage(event.replyToken, errDBMessage);
                                    });
                                respond = null;
                            } else {
                                //Carousel class list
                                respond = getClassList();
                            }
                            break;
                        case 'name':
                            if (args[2] == undefined) {
                                return client.replyMessage(event.replyToken, getMessageJson('Masukan nama tidak valid. Ubah nama dengan command \'!edit name <namamu>\' tanpa tanda kutip dan panah'));
                            }
                            var curName = args[2];
                            for (var i = 3; i < args.length; i++) {
                                curName += ' ' + args[i];
                            }
                            isUserRegistered(event.source.userId)
                                .then((res) => {
                                    if (res.rowCount > 0) {
                                        dbClient.query(`UPDATE PlayerStats SET displayName = '${curName.replace(/'/g, "''")}' WHERE playerId = '${event.source.userId}';`)
                                            .then(() => {
                                                return client.replyMessage(event.replyToken, getMessageJson('Nama kamu sudah diperbarui menjadi: ' + curName));
                                            })
                                            .catch((err) => {
                                                return client.replyMessage(event.replyToken, errDBMessage);
                                            });
                                    } else {
                                        return client.replyMessage(event.replyToken, getMessageJson('Kamu belum terdaftar dalam database bot. Silahkan ketik \'!edit class\' untuk memilih serta mendaftar.'));
                                    }
                                });
                            respond = null;
                            break;
                        default:
                            respond = getMessageJson(`Perintah tidak valid. Perintah harusnya berisi:\n!edit <class/name>`);
                            break;
                    }
                }
                break;
            case 'info':
                if (event.source.type === 'user') {
                    switch (args[1]) {
                        case 'char':
                            isUserRegistered(event.source.userId).then((res) => {
                                if (res.rowCount > 0) {
                                    return client.replyMessage(event.replyToken, getMessageJson(`Nama: ${res.rows[0].displayname}\nClass: ${_class[res.rows[0].class].name}`));
                                } else {
                                    return client.replyMessage(event.replyToken, getMessageJson('Kamu belum terdaftar dalam database bot. Silahkan ketik \'!edit class\' untuk memilih class serta mendaftar.'));
                                }
                            });
                            respond = null;
                            break;
                        case 'skill':
                            isUserRegistered(event.source.userId).then((res) => {
                                if (res.rowCount > 0) {
                                    var resp;
                                    resp = 'Daftar Skill untuk ' + _class[res.rows[0].class].name + '\n======';
                                    var sk = _class[res.rows[0].class].skill;
                                    for (var i = 0; i < sk.length; i++) {
                                        resp += `\n${i + 1}. ${sk[i].sName}`;
                                        resp += `\nDeskripsi: ${sk[i].shortDesc}`;
                                        resp += `\nMasa Pakai: ` + (sk[i].usage == 0 ? 'Tak Terbatas' : sk[i].usage);
                                        var sp, ds, arg, val;
                                        sp = sk[i].effect.split(';');
                                        if (sp[0] != '')
                                            resp += '\n-- Effect --';
                                        for (j = 0; j < sp.length; j++) {
                                            ds = sp[j].substring(0, 2);
                                            switch (ds) {
                                                case 'AT':
                                                    arg = sp[j].substring(2, sp[j].length);
                                                    resp += '\n> ATTACK - Mengurangi darah musuh sebesar ' + -parseInt(arg);
                                                    break;
                                                case 'AP':
                                                    arg = sp[j].substring(2, sp[j].length);
                                                    resp += '\n> ATTACK % - Mengurangi darah musuh sebesar ' + -parseInt(arg) + '%';
                                                    break;
                                                case 'CL':
                                                    resp += '\n> CLEAR POISON - Membersihkan POISON';
                                                    break;
                                            }
                                        }
                                        sp = sk[i].buff.split(';');
                                        if (sp[0] != '')
                                            resp += '\n-- Buff --';
                                        for (k = 0; k < sp.length; k++) {
                                            ds = sp[k].substring(0, 2);
                                            switch (ds) {
                                                case 'ED':
                                                    arg = sp[k].substring(2, sp[k].length).split(',');
                                                    resp += '\n> SHIELD - Hanya menerima ' + arg[0] + '% dari damage musuh selama ' + arg[1] + ' turn';
                                                    break;
                                                case 'HL':
                                                    arg = sp[k].substring(2, sp[k].length).split(',');
                                                    resp += '\n> HEAL UP - Menambah darah ' + arg[0] + '% dari damage musuh selama ' + arg[1] + ' turn';
                                                    break;
                                                case 'AU':
                                                    arg = sp[k].substring(2, sp[k].length).split(',');
                                                    resp += '\n> ATTACK UP - Menambah serangan sebesar ' + arg[0] + '% selama ' + arg[1] + ' turn';
                                                    break;
                                                case 'DP':
                                                    arg = sp[k].substring(2, sp[k].length);
                                                    resp += '\n> OVER DAMAGE - Mengurangi darah sebesar ' + -parseInt(arg) + '%';
                                                    break;
                                                case 'HP':
                                                    arg = sp[k].substring(2, sp[k].length).split(',');
                                                    if (parseInt(arg[1]) == 1) {
                                                        resp += '\n> HP CHANGE - Menambah darah sebesar ' + arg[0];
                                                    } else {
                                                        resp += '\n> POISON - Mengurangi darah sebesar ' + -parseInt(arg[0]) + ' selama ' + arg[1] + ' turn';
                                                    }
                                                    break;
                                            }
                                        }
                                        sp = sk[i].debuff.split(';');
                                        if (sp[0] != '')
                                            resp += '\n-- Debuff --';
                                        for (k = 0; k < sp.length; k++) {
                                            ds = sp[k].substring(0, 2);
                                            switch (ds) {
                                                case 'ST':
                                                    arg = sp[k].substring(2, sp[k].length);
                                                    resp += '\n> STUN - Menambah giliran bermain sebanyak ' + arg + ' turn';
                                                    break;
                                                case 'BA':
                                                    arg = sp[k].substring(2, sp[k].length).split(',');
                                                    resp += '\n> POISON - Mengurangi darah musuh sebesar ' + -parseInt(arg[0]) + ' selama ' + arg[1] + ' turn';
                                                    break;
                                                case 'BL':
                                                    arg = sp[k].substring(2, sp[k].length);
                                                    resp += '\n> BLIND - Membutakan musuh sehingga tak bisa memberi damage (buff dan debuff masih bisa) selama ' + arg + ' turn';
                                                    break;
                                                case 'PD':
                                                    resp += '\n> PURE DAMAGE - Membatalkan semua SHIELD yang aktif dari musuh';
                                                    break;
                                                case 'RH':
                                                    resp += '\n> REVERSE HP - Menukar darah dengan musuh';
                                                    break;
                                                case 'RS':
                                                    resp += '\n> REMOVE SKILL - Menghapus skill musuh yang dipilih. (sisa pakai skill musuh yang dipilih = 0)';
                                                    break;
                                                case 'RA':
                                                    arg = sp[k].substring(2, sp[k].length);
                                                    resp += '\n> REMOVE USAGE SKILL - Menghapus masa pakai skill musuh yang dipilih sebanyak ' + arg + ' kali';
                                                    break;
                                            }
                                        }
                                        resp += '\n======';
                                    }
                                    return client.replyMessage(event.replyToken, getMessageJson(resp));
                                } else {
                                    return client.replyMessage(event.replyToken, getMessageJson('Kamu belum terdaftar dalam database bot. Silahkan ketik \'!edit class\' untuk memilih class serta mendaftar.'));
                                }
                            });
                            respond = null;
                            break;
                    }
                }
                break;
            case 'commands':
                if (event.source.type === 'user') {
                    respond = getMessageJson('Daftar perintah untuk user:\n\n!edit class [<idx>]\nMengganti class karaktermu\n\n!edit name <nama>\nMengganti nama karaktermu\n\n!info <char/skill>\nMelihat info karakter/skillmu\n\n!saran <pesan, kesan, dan saran>\nMemberi pesan pada developer\n\nNB: [] = opsional, <> = nilai, <a/b> = pilih salah satu');
                }
                else {
                    respond = getMessageJson('Daftar perintah untuk grup:\n\n!joinpvp\nMemasuki room permainan\n\n!playpvp\nMembuat permainan baru\n\n!player\nMenampilkan daftar pemain beserta class dan darahnya di room\n\n!ACTION\nMendapatkan giliran\n\n!exit\nMemberhentikan permainan\n\n!kick\nMengeluarkan bot dari grup/room');
                }
                break;
            case 'debug':
                if (event.source.type === 'user' && event.source.userId == 'U6e1b0bcf6299166f09484785507f85e0') {
                    switch (args[1]) {
                        case 'player':
                            respond = null;
                            dbClient.query('SELECT * FROM PlayerStats').then((r) => {
                                return client.replyMessage(event.replyToken, getMessageJson(`DATA\n${JSON.stringify(r.rows)}`));
                            });
                            break;
                        case 'rooms':
                            return client.replyMessage(event.replyToken, getMessageJson(`DATA\n${_rooms}`));
                            break;
                        case 'locked':
                            return client.replyMessage(event.replyToken, getMessageJson(`DATA\n${_lockedUsers}`));
                            break;
                        case 'saran':
                            respond = null;
                            dbClient.query('SELECT * FROM PlayerFAQ').then((r) => {
                                return client.replyMessage(event.replyToken, getMessageJson(`DATA\n${JSON.stringify(r.rows)}`));
                            });
                            break;
                    }
                }
                break;
        }
        if (respond != undefined)
            return client.replyMessage(event.replyToken, respond);
        else if (respond === undefined)
            return client.replyMessage(event.replyToken, getMessageJson('Perintah tidak diketahui. !commands untuk melihat daftar perintah yang tersedia.'));
    }
}
//#endregion

//#region PORT LISTENER
const port = process.env.PORT || 3000;
app.listen(port, () => { });
//#endregion