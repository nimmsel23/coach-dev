import config from '../../workspaces/coo/config.json'
import skillsDoc from '../../workspaces/coo/skills.json'
import systemPrompt from '../../workspaces/coo/system-prompt.md?raw'

/** Normalize tools[] (function-calling) or legacy skills[] into { id, name, ... }. */
function normalizeSkills(doc) {
  const tools = Array.isArray(doc?.tools) ? doc.tools : []
  if (tools.length) {
    return tools.map((t) => ({
      ...t,
      id: t.name,
      name: t.name,
    }))
  }
  const legacy = Array.isArray(doc?.skills) ? doc.skills : []
  return legacy.map((s) => ({
    ...s,
    id: s.id || s.name,
    name: s.name || s.id,
  }))
}

export function loadCooBrain() {
  const skills = normalizeSkills(skillsDoc)
  const meta = {
    workspaceId: skillsDoc.workspaceId || config.id,
    roleTitle: skillsDoc.roleTitle || config.title,
    defaultModel: skillsDoc.defaultModel || config.defaultModel,
    temperature: skillsDoc.temperature ?? config.temperature ?? 0.35,
    collections: skillsDoc.collections || null,
    version: skillsDoc.version || config.version || '0',
  }
  return {
    config: { ...config, ...meta },
    skills,
    skillsDoc,
    systemPrompt: String(systemPrompt || '').trim(),
    versionLabel: `COO v${meta.version} – ${config.focus || 'Coaching-Delivery'}`,
  }
}

export function skillById(skills, id) {
  return skills.find((s) => s.id === id || s.name === id) || null
}

export function skillRequiresApproval(config, skill) {
  if (!skill) return false
  if (skill.requiresApproval) return true
  const key = skill.id || skill.name
  return Array.isArray(config?.requiresApproval) && config.requiresApproval.includes(key)
}

/** OpenAI-/MCP-kompatible Tool-Liste aus dem Brain (für späteren LLM-Router). */
export function toFunctionTools(brain) {
  return (brain.skills || []).map((s) => ({
    type: 'function',
    function: {
      name: s.name || s.id,
      description: s.description || '',
      parameters: s.parameters || { type: 'object', properties: {} },
    },
  }))
}
