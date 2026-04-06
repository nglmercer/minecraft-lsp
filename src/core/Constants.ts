export const COMMANDS = {
  RUN: 'run',
  EXECUTE: 'execute',
};

export const SELECTORS = ['@p', '@a', '@r', '@e', '@s'];

export const REGISTRIES = {
    ENTITY_TYPE: 'entity_type',
    ITEM: 'item',
    BLOCK: 'block',
    DIMENSION: 'dimension',
    BIOME: 'worldgen/biome',
    ATTRIBUTE: 'attribute',
    PARTICLE: 'particle',
    PARTICLE_TYPE: 'particle_type',
    RECIPE: 'recipe',
    RECIPE_TYPE: 'recipe_type',
    SOUND: 'sound',
    SOUND_EVENT: 'sound_event',
    POTION: 'potion',
    ENCHANTMENT: 'enchantment',
    LOOT_TABLES: 'loot_tables',
    RECIPES: 'recipes',
    GAMEMODE: 'gamemode',
    DIFFICULTY: 'difficulty',
    SLOT: 'slot',
    OBJECTIVE: 'objective',
    TEAM: 'team'
};

export const PARSER_REGISTRIES: Record<string, string> = {
  'minecraft:entity': REGISTRIES.ENTITY_TYPE,
  'minecraft:entity_summon': REGISTRIES.ENTITY_TYPE,
  'minecraft:game_profile': REGISTRIES.ENTITY_TYPE,
  'minecraft:item_predicate': REGISTRIES.ITEM,
  'minecraft:item_stack': REGISTRIES.ITEM,
  'minecraft:block_pos': REGISTRIES.DIMENSION,
  'minecraft:resource_location': REGISTRIES.BIOME,
  'minecraft:nbt_path': REGISTRIES.ATTRIBUTE,
  'minecraft:particle': REGISTRIES.PARTICLE_TYPE,
  'minecraft:mob': REGISTRIES.ENTITY_TYPE,
  'minecraft:recipe': REGISTRIES.RECIPE_TYPE,
  'minecraft:sound': REGISTRIES.SOUND_EVENT,
  'minecraft:potion': REGISTRIES.POTION,
  'minecraft:enchantment': REGISTRIES.ENCHANTMENT,
  'minecraft:entity_anchor': 'entity_anchor',
  'minecraft:item_slot': REGISTRIES.SLOT,
  'minecraft:objective': REGISTRIES.OBJECTIVE,
  'minecraft:team': REGISTRIES.TEAM,
  'minecraft:gamemode': REGISTRIES.GAMEMODE,
};

export const PARSER_SUGGESTIONS: Record<string, string[]> = {
  'brigadier:bool': ['true', 'false'],
  'brigadier:float': ['0.0'],
  'brigadier:integer': ['0'],
  'minecraft:block_pos': ['~ ~ ~', '~', '0 0 0'],
  'minecraft:vec3': ['~ ~ ~', '0.0 0.0 0.0'],
  'minecraft:vec2': ['~ ~', '0.0 0.0'],
  'minecraft:nbt_compound_tag': ['{}', '{PersistenceRequired:1}', '{CustomName:\'""\'}', '{NoAI:1}'],
  'minecraft:entity_anchor': ['eyes', 'feet'],
  'minecraft:swizzle': ['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz'],
  'minecraft:operation': ['=', '+=', '-=', '*=', '/=', '%=', '<', '>', '><'],
  'minecraft:gamemode': ['survival', 'creative', 'adventure', 'spectator'],
  'minecraft:difficulty': ['peaceful', 'easy', 'normal', 'hard'],
  'minecraft:time': ['day', 'night', 'noon', 'midnight', '1000', '6000', '12000', '18000'],
  'minecraft:scoreboard_slot': ['list', 'sidebar', 'belowName', 'sidebar.team.red', 'sidebar.team.blue'],
  'minecraft:color': ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'],
};
