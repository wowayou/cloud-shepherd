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
  },

  orientation: {
    rotate: '请把设备横过来玩游戏哦',
  },
} as const;

export type FactCardKey = keyof typeof STRINGS.facts;
