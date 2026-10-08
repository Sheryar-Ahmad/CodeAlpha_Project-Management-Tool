// Templates fill the normal form; saving still uses the same validated task API.
export const taskTemplates = [
  {
    id: 'kickoff',
    name: 'Project kickoff',
    title: 'Plan the project kickoff',
    description: 'Agree on the outcome, scope, and first deliverable before work begins.',
    steps: [
      'Define the outcome and success criteria',
      'List the first deliverables',
      'Identify risks and unanswered questions',
      'Agree on the next action',
    ],
  },
  {
    id: 'research',
    name: 'Research assignment',
    title: 'Prepare the research assignment',
    description: 'Turn a broad question into a clear, referenced piece of work.',
    steps: [
      'Clarify the research question',
      'Collect reliable sources',
      'Draft the main findings',
      'Review references and submit',
    ],
  },
  {
    id: 'meeting',
    name: 'Meeting follow-up',
    title: 'Follow up on the meeting',
    description:
      'Capture decisions and make the next steps clear while the discussion is fresh.',
    steps: [
      'Write down the key decisions',
      'List action items and who to contact',
      'Share the relevant notes',
      'Check that the next steps are understood',
    ],
  },
  {
    id: 'review',
    name: 'Weekly review',
    title: 'Review the week and plan ahead',
    description: 'Close loose ends and choose a realistic focus for the coming week.',
    steps: [
      'Review finished and unfinished work',
      'Check deadlines and blocked tasks',
      'Capture loose reminders',
      'Choose the next three priorities',
    ],
  },
];

export function createTemplateDraft(templateId) {
  const template = taskTemplates.find((item) => item.id === templateId);
  if (!template) return null;
  // Each use gets independent step IDs and starts with an unfinished checklist.
  return {
    title: template.title,
    description: template.description,
    checklist: template.steps.map((text) => ({
      id: crypto.randomUUID(),
      text,
      done: false,
    })),
  };
}
