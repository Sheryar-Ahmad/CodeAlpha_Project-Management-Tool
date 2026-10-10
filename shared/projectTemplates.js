// Curated blueprints are deliberately small: adapt the tasks after applying one.
export const projectTemplates = [
  {
    id: 'workshop-v1',
    name: 'Community workshop',
    description: 'Prepare a useful session, welcome people and collect feedback.',
    tasks: [
      {
        title: 'Define the workshop outcome',
        description: 'Choose an audience and one useful outcome.',
        estimateMinutes: 45,
        steps: ['Define the audience', 'Write the session outcome', 'Confirm the format'],
      },
      {
        title: 'Prepare the session',
        description: 'Create the material and check the practical details.',
        estimateMinutes: 180,
        steps: [
          'Prepare the outline',
          'Confirm the venue or meeting link',
          'Test the material',
        ],
      },
      {
        title: 'Review workshop feedback',
        description: 'Use feedback to improve the next session.',
        estimateMinutes: 60,
        steps: ['Collect feedback', 'Record what worked', 'Choose one improvement'],
      },
    ],
  },
  {
    id: 'launch-v1',
    name: 'Small product launch',
    description: 'Define the release, check it and plan the handoff.',
    tasks: [
      {
        title: 'Agree on the release scope',
        description: 'Make the first release useful and achievable.',
        estimateMinutes: 60,
        steps: ['Define success', 'Choose must-have work', 'Record exclusions'],
      },
      {
        title: 'Check the release',
        description: 'Test the main journeys before sharing the product.',
        estimateMinutes: 120,
        steps: ['Test on mobile', 'Check error and empty states', 'Review accessibility'],
      },
      {
        title: 'Prepare the handoff',
        description: 'Help people understand and use the release.',
        estimateMinutes: 90,
        steps: [
          'Write quick-start guidance',
          'Record known limits',
          'Share the release plan',
        ],
      },
    ],
  },
  {
    id: 'research-v1',
    name: 'Research project',
    description: 'Ask a focused question, gather evidence and share findings.',
    tasks: [
      {
        title: 'Frame the research question',
        description: 'Define what you need to learn and why.',
        estimateMinutes: 45,
        steps: ['State the question', 'Choose the method', 'Define the output'],
      },
      {
        title: 'Gather and organize evidence',
        description: 'Keep sources and observations together.',
        estimateMinutes: 180,
        steps: ['Collect reliable sources', 'Record observations', 'Check gaps'],
      },
      {
        title: 'Share research findings',
        description: 'Turn evidence into an understandable conclusion.',
        estimateMinutes: 90,
        steps: ['Summarize findings', 'Record limitations', 'Present next steps'],
      },
    ],
  },
];
