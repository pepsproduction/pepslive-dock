(function(global){
  'use strict';

  var PROTOCOL = 'PEPSLIVE_SCOREBOARD_STATE_V1';
  var VERSION = 1;
  var CHANNEL = 'pepslive-scoreboard-state-v1';
  var STORAGE_KEY = 'pepslive.scoreboard.sharedState.v1';
  var EVENT_NAME = 'pepslive:scoreboard-state-updated';
  var SOURCE = 'pepslive-dock';
  var publishSeq = 0;

  function safeWarn(message, error){
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[SkinSync] ' + message, error || '');
      }
    } catch (_) {}
  }

  function asObject(value){
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function getByPath(obj, path){
    if (!obj || !path) return undefined;
    var cur = obj;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i += 1) {
      var key = parts[i];
      if (!cur || typeof cur !== 'object' || !(key in cur)) return undefined;
      cur = cur[key];
    }
    return cur;
  }

  function firstValue(obj, paths, fallback){
    for (var i = 0; i < paths.length; i += 1) {
      var value = getByPath(obj, paths[i]);
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return fallback;
  }

  function toNumber(value, fallback){
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallback || 0);
  }

  function normalizeSport(rawSport){
    var sport = String(rawSport || '').toLowerCase().trim();
    if (sport === 'football' || sport === 'soccer' || sport === 'futsal') return 'football';
    if (sport === 'basketball' || sport === 'basket3' || sport === 'basket5' || sport === 'basket' || sport === '3x3' || sport === '5v5') return 'basketball';
    return 'football';
  }

  function normalizeType(rawType, statusLabel){
    var value = String(rawType || '').toLowerCase().trim();
    if (value === 'live' || value === 'summary') return value;
    var status = String(statusLabel || '').toUpperCase();
    if (status.indexOf('FULL') !== -1 || status.indexOf('FINAL') !== -1 || status.indexOf('FINISH') !== -1 || status === 'FT') return 'summary';
    return 'live';
  }

  function shortName(name, fallback){
    var value = String(name || '').trim();
    if (!value) return fallback || 'TEAM';
    var compact = value.replace(/\s+/g, ' ').trim();
    var parts = compact.split(' ');
    if (parts.length > 1) {
      var initials = '';
      for (var i = 0; i < parts.length && initials.length < 3; i += 1) {
        if (parts[i]) initials += parts[i].charAt(0);
      }
      if (initials) return initials.toUpperCase();
    }
    return compact.slice(0, 3).toUpperCase();
  }

  function toClockText(rawClock, clockSec){
    var text = String(rawClock || '').trim();
    if (text) return text;
    var seconds = Number(clockSec);
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function extractTheme(input){
    var obj = asObject(input);
    return {
      homeColor: firstValue(obj, ['teamAColor', 'homeColor', 'homeTeam.color', 'teams.home.color', 'settings.teamColors.aPrimary', 'theme.homeColor'], ''),
      awayColor: firstValue(obj, ['teamBColor', 'awayColor', 'awayTeam.color', 'teams.away.color', 'settings.teamColors.bPrimary', 'theme.awayColor'], '')
    };
  }

  function createSkinStudioPayloadFromDockState(dockState){
    try {
      var input = asObject(dockState);
      var sport = normalizeSport(firstValue(input, ['sport', 'match.sport', 'meta.sport'], 'football'));
      var eventName = firstValue(input, ['eventTitle', 'tournamentName', 'leagueName', 'event.name', 'eventName', 'match.eventName'], 'PEPS LIVE');
      var eventLogo = firstValue(input, ['eventLogo', 'event.logo', 'match.eventLogo'], '');

      var homeName = firstValue(input, ['teamAName', 'homeName', 'homeTeam.name', 'teams.home.name', 'match.TeamA', 'match.homeName'], 'TEAM A');
      var awayName = firstValue(input, ['teamBName', 'awayName', 'awayTeam.name', 'teams.away.name', 'match.TeamB', 'match.awayName'], 'TEAM B');

      var homeScore = toNumber(firstValue(input, ['teamAScore', 'scoreA', 'homeScore', 'homeTeam.score', 'teams.home.score', 'match.ScoreA', 'score.home'], 0), 0);
      var awayScore = toNumber(firstValue(input, ['teamBScore', 'scoreB', 'awayScore', 'awayTeam.score', 'teams.away.score', 'match.ScoreB', 'score.away'], 0), 0);

      var homeLogo = firstValue(input, ['teamALogo', 'homeLogo', 'homeTeam.logo', 'teams.home.logo', 'match.LogoA'], '');
      var awayLogo = firstValue(input, ['teamBLogo', 'awayLogo', 'awayTeam.logo', 'teams.away.logo', 'match.LogoB'], '');

      var gameClock = toClockText(firstValue(input, ['matchTime', 'timer', 'clockText', 'gameClock', 'clock.time', 'clock', 'match.gameClock'], ''), firstValue(input, ['clockSec', 'timerSec'], undefined));
      var periodLabel = firstValue(input, ['period', 'half', 'quarter', 'clock.period', 'periodLabel', 'match.periodLabel'], sport === 'football' ? '1H' : 'Q1');
      var statusLabel = firstValue(input, ['matchStatus', 'status', 'clock.status', 'statusLabel', 'match.statusLabel', 'state.status'], 'LIVE');

      var matchData = {
        eventName: String(eventName || ''),
        eventLogo: String(eventLogo || ''),
        homeLogo: String(homeLogo || ''),
        awayLogo: String(awayLogo || ''),
        homeName: String(homeName || 'TEAM A'),
        awayName: String(awayName || 'TEAM B'),
        homeShortName: String(firstValue(input, ['homeShortName', 'homeTeam.shortName', 'teams.home.shortName'], shortName(homeName, 'HOME')) || shortName(homeName, 'HOME')),
        awayShortName: String(firstValue(input, ['awayShortName', 'awayTeam.shortName', 'teams.away.shortName'], shortName(awayName, 'AWAY')) || shortName(awayName, 'AWAY')),
        homeScore: homeScore,
        awayScore: awayScore,
        gameClock: String(gameClock || '00:00'),
        periodLabel: String(periodLabel || ''),
        statusLabel: String(statusLabel || 'LIVE'),
        addedTime: firstValue(input, ['addedTime', 'match.addedTime'], ''),
        aggregateScore: firstValue(input, ['aggregateScore', 'match.aggregateScore'], ''),
        penaltyScore: firstValue(input, ['penaltyScore', 'match.penaltyScore'], ''),
        goalScorerList: firstValue(input, ['goalScorerList', 'match.goalScorerList'], []),
        cardInfo: firstValue(input, ['cardInfo', 'match.cardInfo'], ''),
        shotClock: String(firstValue(input, ['shotClock', 'match.shotClock'], '')),
        homeFouls: toNumber(firstValue(input, ['teamAFouls', 'homeFouls', 'homeTeam.fouls', 'teams.home.fouls', 'match.homeFouls'], 0), 0),
        awayFouls: toNumber(firstValue(input, ['teamBFouls', 'awayFouls', 'awayTeam.fouls', 'teams.away.fouls', 'match.awayFouls'], 0), 0),
        homeTimeouts: toNumber(firstValue(input, ['teamATimeouts', 'homeTimeouts', 'homeTeam.timeouts', 'teams.home.timeouts', 'match.homeTimeouts'], 0), 0),
        awayTimeouts: toNumber(firstValue(input, ['teamBTimeouts', 'awayTimeouts', 'awayTeam.timeouts', 'teams.away.timeouts', 'match.awayTimeouts'], 0), 0),
        possession: firstValue(input, ['possession', 'match.possession'], ''),
        bonus: firstValue(input, ['bonus', 'match.bonus'], '')
      };

      return {
        protocol: PROTOCOL,
        version: VERSION,
        source: SOURCE,
        timestamp: new Date().toISOString(),
        seq: ++publishSeq,
        sport: sport,
        type: normalizeType(firstValue(input, ['type', 'viewType'], ''), statusLabel),
        skinId: firstValue(input, ['skinId', 'activeSkinId', 'match.skinId'], ''),
        matchData: matchData,
        theme: extractTheme(input),
        animation: asObject(firstValue(input, ['animation'], {}))
      };
    } catch (error) {
      safeWarn('create payload failed', error);
      return {
        protocol: PROTOCOL,
        version: VERSION,
        source: SOURCE,
        timestamp: new Date().toISOString(),
        sport: 'football',
        type: 'live',
        skinId: '',
        matchData: {
          eventName: 'PEPS LIVE',
          eventLogo: '',
          homeLogo: '',
          awayLogo: '',
          homeName: 'TEAM A',
          awayName: 'TEAM B',
          homeShortName: 'TEA',
          awayShortName: 'TEA',
          homeScore: 0,
          awayScore: 0,
          gameClock: '00:00',
          periodLabel: '1H',
          statusLabel: 'LIVE'
        },
        theme: { homeColor: '', awayColor: '' },
        animation: {}
      };
    }
  }

  function writeScoreboardSkinStateToLocalStorage(payload){
    try {
      if (typeof localStorage === 'undefined') return { ok: false, mode: 'localStorage', reason: 'unavailable' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return { ok: true, mode: 'localStorage' };
    } catch (error) {
      safeWarn('localStorage write failed', error);
      return { ok: false, mode: 'localStorage', reason: error && error.message ? error.message : String(error) };
    }
  }

  function sendScoreboardSkinBroadcast(payload){
    var result = { ok: false, mode: 'broadcast', reason: 'unsupported' };
    try {
      if (typeof BroadcastChannel === 'undefined') return result;
      var channel = new BroadcastChannel(CHANNEL);
      channel.postMessage({
        type: 'PEPSLIVE_STATE_UPDATE',
        protocol: PROTOCOL,
        timestamp: payload && payload.timestamp ? payload.timestamp : new Date().toISOString(),
        payload: payload
      });
      channel.close();
      return { ok: true, mode: 'broadcast' };
    } catch (error) {
      safeWarn('broadcast failed', error);
      return { ok: false, mode: 'broadcast', reason: error && error.message ? error.message : String(error) };
    }
  }

  function dispatchLocalEvent(payload){
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
        return { ok: true, mode: 'event' };
      }
      return { ok: false, mode: 'event', reason: 'unsupported' };
    } catch (error) {
      safeWarn('dispatch event failed', error);
      return { ok: false, mode: 'event', reason: error && error.message ? error.message : String(error) };
    }
  }

  function publishScoreboardSkinState(dockState){
    try {
      var payload = createSkinStudioPayloadFromDockState(dockState);
      var broadcast = sendScoreboardSkinBroadcast(payload);
      var storage = writeScoreboardSkinStateToLocalStorage(payload);
      var eventResult = dispatchLocalEvent(payload);
      return {
        ok: !!(broadcast.ok || storage.ok || eventResult.ok),
        payload: payload,
        transport: {
          broadcast: broadcast,
          localStorage: storage,
          event: eventResult
        }
      };
    } catch (error) {
      safeWarn('publish failed', error);
      return {
        ok: false,
        payload: null,
        transport: {
          broadcast: { ok: false, reason: 'publish_failed' },
          localStorage: { ok: false, reason: 'publish_failed' },
          event: { ok: false, reason: 'publish_failed' }
        },
        error: error && error.message ? error.message : String(error)
      };
    }
  }

  function installScoreboardSkinAutoSync(getDockState, options){
    var opts = asObject(options);
    var intervalMs = Number(opts.intervalMs || 250);
    var debounceMs = Number(opts.debounceMs || 120);
    var timerMinIntervalMs = Number(opts.timerMinIntervalMs || 1000);
    var isEnabled = typeof opts.enabled === 'function' ? opts.enabled : function(){ return opts.enabled !== false; };

    var lastSignature = '';
    var lastPublishedAt = 0;
    var debounceTimer = null;
    var intervalTimer = null;

    function buildSignature(payload){
      try {
        var md = payload && payload.matchData ? payload.matchData : {};
        var summary = {
          sport: payload && payload.sport,
          type: payload && payload.type,
          skinId: payload && payload.skinId,
          homeName: md.homeName,
          awayName: md.awayName,
          homeScore: md.homeScore,
          awayScore: md.awayScore,
          gameClock: md.gameClock,
          periodLabel: md.periodLabel,
          statusLabel: md.statusLabel,
          addedTime: md.addedTime,
          shotClock: md.shotClock,
          homeFouls: md.homeFouls,
          awayFouls: md.awayFouls,
          homeTimeouts: md.homeTimeouts,
          awayTimeouts: md.awayTimeouts
        };
        return JSON.stringify(summary);
      } catch (_) {
        return String(Date.now());
      }
    }

    function maybePublish(){
      if (!isEnabled()) return;
      var dockState;
      try {
        dockState = typeof getDockState === 'function' ? getDockState() : {};
      } catch (error) {
        safeWarn('getDockState failed', error);
        return;
      }
      var payload = createSkinStudioPayloadFromDockState(dockState);
      var signature = buildSignature(payload);
      if (signature === lastSignature) return;
      var now = Date.now();
      var timerRunning = !!firstValue(asObject(dockState), ['timerRunning', 'clock.running', 'match.timerRunning'], false);
      if (timerRunning && now - lastPublishedAt < timerMinIntervalMs) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function(){
        var result = publishScoreboardSkinState(dockState);
        if (result && result.ok) {
          lastSignature = signature;
          lastPublishedAt = Date.now();
        }
        if (typeof opts.onPublished === 'function') {
          try { opts.onPublished(result); } catch (_) {}
        }
      }, Math.max(0, debounceMs));
    }

    intervalTimer = setInterval(maybePublish, Math.max(100, intervalMs));
    maybePublish();

    return {
      publishNow: function(){
        var stateNow = typeof getDockState === 'function' ? getDockState() : {};
        var result = publishScoreboardSkinState(stateNow);
        if (result && result.ok) {
          lastSignature = buildSignature(result.payload);
          lastPublishedAt = Date.now();
        }
        return result;
      },
      stop: function(){
        if (debounceTimer) clearTimeout(debounceTimer);
        if (intervalTimer) clearInterval(intervalTimer);
      },
      isEnabled: function(){ return !!isEnabled(); }
    };
  }

  var api = {
    PROTOCOL: PROTOCOL,
    VERSION: VERSION,
    CHANNEL: CHANNEL,
    STORAGE_KEY: STORAGE_KEY,
    EVENT_NAME: EVENT_NAME,
    SOURCE: SOURCE,
    createSkinStudioPayloadFromDockState: createSkinStudioPayloadFromDockState,
    publishScoreboardSkinState: publishScoreboardSkinState,
    writeScoreboardSkinStateToLocalStorage: writeScoreboardSkinStateToLocalStorage,
    sendScoreboardSkinBroadcast: sendScoreboardSkinBroadcast,
    installScoreboardSkinAutoSync: installScoreboardSkinAutoSync
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.ScoreboardSkinSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
