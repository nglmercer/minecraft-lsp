import { NodeType, type CommandNode } from './Types';

export function validateArgument(part: string, node: CommandNode): { isValid: boolean; message?: string } {
    const parser = node.parser || 'unknown';
    const name = node.properties?.name || 'value';
    
    switch (parser) {
        case 'brigadier:integer': {
            const val = parseInt(part);
            if (isNaN(val)) return { isValid: false, message: `Expected integer for "${name}"` };
            if (node.properties?.min !== undefined && val < node.properties.min) return { isValid: false, message: `Value must be at least ${node.properties.min}` };
            if (node.properties?.max !== undefined && val > node.properties.max) return { isValid: false, message: `Value must be at most ${node.properties.max}` };
            return { isValid: true };
        }
        case 'brigadier:float':
        case 'brigadier:double': {
            const val = parseFloat(part);
            if (isNaN(val)) return { isValid: false, message: `Expected number for "${name}"` };
            if (node.properties?.min !== undefined && val < node.properties.min) return { isValid: false, message: `Value must be at least ${node.properties.min}` };
            if (node.properties?.max !== undefined && val > node.properties.max) return { isValid: false, message: `Value must be at most ${node.properties.max}` };
            return { isValid: true };
        }
        case 'brigadier:bool': {
            if (part !== 'true' && part !== 'false') return { isValid: false, message: `Expected true or false for "${name}"` };
            return { isValid: true };
        }
        case 'minecraft:resource_location':
        case 'minecraft:entity_summon':
        case 'minecraft:item_stack':
        case 'minecraft:item_predicate':
        case 'minecraft:block_state':
        case 'minecraft:block_predicate':
        case 'minecraft:dimension':
        case 'minecraft:biome':
            if (!part.match(/^[a-z0-9_./:\-]+$/i)) return { isValid: false, message: `Invalid identifier for "${name}"` };
            return { isValid: true };
        case 'minecraft:entity':
        case 'minecraft:game_profile':
            if (!part.match(/^[a-z0-9_./:~\-@\[\]={}"', ]+$/i)) return { isValid: false, message: `Invalid value for "${name}"` };
            return { isValid: true };
        case 'minecraft:vec3':
        case 'minecraft:vec2':
        case 'minecraft:block_pos':
        case 'minecraft:column_pos':
        case 'minecraft:rotation':
        case 'minecraft:message':
            return { isValid: true };
        default:
            return { isValid: true };
    }
}
