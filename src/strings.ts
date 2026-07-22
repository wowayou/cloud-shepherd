/**
 * All user-facing copy lives here (i18n-ready: one flat dict, swap this
 * file for a locale to translate). Chinese is the only locale for v1.
 */

export const STRINGS = {
  app: {
    title: '云朵牧羊人',
  },

  profile: {
    chooseTitle: '谁在玩呀？',
    newProfile: '新建角色',
    namePlaceholder: '给自己起个名字',
    confirm: '就是我啦',
  },

  menu: {
    play: '开始游戏',
    levelSelect: '选关卡',
    switchProfile: '换个人玩',
  },

  levelSelect: {
    title: '选一关吧',
    tierEasy: '轻松模式',
    tierHard: '挑战模式',
    locked: '还没解锁哦',
  },

  hud: {
    pause: '暂停',
    mute: '静音',
    unmute: '开声音',
    resume: '继续',
    retry: '重新来',
    quit: '回菜单',
  },

  result: {
    title: '太棒了！',
    subtitleAllBloom: '所有的花都开啦 🌸',
    nextLevel: '下一关',
    backToLevels: '回选关',
    knowThis: '你知道吗？',
    tapToFlip: '点一下看看',
  },

  // How stars are earned. Hard tier grades on two things — how long you took
  // and how much water you spilled — and until round 7 the game never said so.
  stars: {
    easyAlways: '轻松模式：完成就是三颗星 ⭐⭐⭐',
    goalTitle: '三星目标',
    time: '用时',
    waste: '浪费的水',
    within: (sec: string) => `${sec} 秒内`,
    atMost: (n: string) => `不超过 ${n} 滴`,
    /** Result-screen line, e.g. "用时 12.4 秒（三星要 11 秒内）" */
    timeDetail: (used: string, need: string) => `用时 ${used} 秒（三星要 ${need} 秒内）`,
    wasteDetail: (used: string, need: string) => `浪费 ${used} 滴（三星要不超过 ${need} 滴）`,
    metTime: '时间达标 ✓',
    metWaste: '省水达标 ✓',
    hintTime: '下次快一点点就能多一颗星',
    hintWaste: '下次少浪费点水就能多一颗星',
    hintBoth: '再快一点、再省一点，就是三颗星',
    perfect: '完美！又快又省水 🎉',
  },

  // One-line introductions for the levels that add a new hazard.
  levelIntro: {
    wind: '有风啦！云会被吹偏——手指要往上风的方向带一点',
    gust: '阵风会一阵强一阵弱，跟着风修正就行',
    thermal: '热气流会把云往上顶——太阳晒热的空气会上升哦',
    birds: '小心飞鸟！撞上会把云里的水撞掉一些',
    cold: '冷空气团里云会冻住——不能喝水也不能下雨，绕开它',
    mixed: '风、热气流、飞鸟都来了，看准了再走',
    lake: '水在中间啦！围着湖转一圈给四面的田浇水',
    twoSeas: '两边都是海——就近喝水就好，不用跑回左边',
    snow: '飞得高，雨会变成雪积在山顶——太阳暖了再融化流下山',
  },

  tutorial: {
    dragCloud: '用手指按住云朵，拖着它走吧',
    goToSea: '带云朵去海面上低低地飞——太阳会把海水变成水蒸气',
    cloudFull: '云朵喝饱了水蒸气，变大变重啦！',
    goToField: '现在把沉甸甸的云朵带到干渴的田地上方',
    holdToRain: '停住不动——水太重了，会变成雨掉下来',
    watchBloom: '雨水浇开花啦！水会流回大海，再变成云，一直转圈圈',
  },

  facts: {
    evaporation: {
      emoji: '☀️',
      text: '太阳一晒，海里的水会变成看不见的水蒸气，飘到天上。',
    },
    cloudForms: {
      emoji: '☁️',
      text: '好多水蒸气聚在一起就成了云；云越攒越多就变灰变重。',
    },
    rainFalls: {
      emoji: '🌧️',
      text: '云里的水太重，就掉下来变成雨，落进田里。',
    },
    cycle: {
      emoji: '🔁',
      text: '雨水流回大海，又被太阳晒成水蒸气……水一直转圈圈，用不完。',
    },
    saveWater: {
      emoji: '💧',
      text: '地球上能喝的水其实很少，别让水白白浪费掉哦。',
    },
    snowMelt: {
      emoji: '❄️',
      text: '高处太冷，雨会冻成雪；太阳一暖，雪又化成水，流进田里。',
    },
  },

  orientation: {
    rotate: '请把设备横过来玩游戏哦',
  },
} as const;

export type FactCardKey = keyof typeof STRINGS.facts;
