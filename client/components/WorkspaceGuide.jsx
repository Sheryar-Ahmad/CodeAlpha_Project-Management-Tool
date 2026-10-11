import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronLeft, ChevronRight, Minus, X } from 'lucide-react';
import useModal from '../hooks/useModal.js';

const chapters = [
  {
    view: 'all',
    title: 'Your work, together',
    text: 'The Task board brings your personal tasks and shared tasks assigned to you into one place. Move work through To do, In progress and Done.',
    tip: 'Use New task to describe the work, choose a project and set a deadline. Search and All projects help you find it again.',
  },
  {
    view: 'all',
    title: 'Break work into clear steps',
    text: 'Open Subtasks & activity on a task to add independent pieces of work. Each subtask can have its own deadline, status and assignee.',
    tip: 'Checklists are simpler steps inside a task. Recurring tasks use checklists instead of independent subtasks. Notes and resource links keep instructions close to the work.',
  },
  {
    view: 'today',
    title: 'Choose what matters today',
    text: 'Today shows unfinished work due today or overdue. Upcoming shows deadlines in the next seven days, starting tomorrow.',
    tip: 'On a phone, Tasks, Today, Calendar and Projects are one tap away in the bottom navigation. More opens the other views.',
  },
  {
    view: 'calendar',
    title: 'Make deadlines easy to see',
    text: 'Calendar shows personal and assigned shared deadlines across the month. Select a day to plan a new task; open a task to see its details.',
    tip: 'Calendar options on a task let you download a calendar file or open a Google Calendar draft. These are snapshots, not automatic synchronization.',
  },
  {
    view: 'projects',
    title: 'Give each project a purpose',
    text: 'Projects groups your personal work. Add a brief, planning dates and milestones, then use the notebook for notes, decisions and meeting follow-ups.',
    tip: 'Project progress comes from completed tasks. Its planning status and dates are separate from task status.',
  },
  {
    view: 'teams',
    title: 'Invite people and divide the work',
    text: 'Choose a project in Team projects and invite an existing Orbit account. After they accept, assign a task or subtask to an accepted member.',
    tip: 'Assigned work appears on their main Task board. Use Discussion for instructions and questions. Guests get a restricted read-only view; they cannot be assigned work.',
  },
  {
    view: 'teams',
    title: 'Keep a team moving',
    text: 'The project tabs cover shared tasks, dependencies, workload, goals, workflow rules, reviews and work requests. Start with shared tasks and add the tools your project needs.',
    tip: 'Use task estimates and weekly capacity in Workload, prerequisites in Dependencies, and Reviews when another person needs to approve a brief or resource link.',
  },
  {
    view: 'portfolio',
    title: 'Know when someone needs you',
    text: 'The Notifications bell shows invitations and task assignments. Portfolio brings project health, pending reviews and targeted discussion alerts together.',
    tip: 'Alerts refresh while Orbit is open, usually within 30 seconds. You can refresh the inbox yourself. Orbit does not currently send email or push alerts.',
  },
  {
    view: 'attention',
    title: 'Find the next thing to resolve',
    text: 'Action Center brings unfinished urgent, overdue, imminent and blocked work together. Blockers gives you a focused view of work that cannot move forward.',
    tip: 'When you mark a task Blocked, write the reason so the next person knows what is needed.',
  },
  {
    view: 'focus',
    title: 'Make room for focused work',
    text: 'Focus timer helps you concentrate on one goal. Work log records time you actually worked and shows a weekly timesheet.',
    tip: 'The timer stays in this browser. Work logs are saved to your account; running the timer does not automatically create a log.',
  },
  {
    view: 'archived',
    title: 'Recover work and keep a backup',
    text: 'Archive clears finished work from your active board while keeping it saved. Trash lets you restore deleted tasks before you choose permanent deletion.',
    tip: 'Export owned tasks and Import task backup are in the workspace footer. The task backup does not include every project, notebook or work-log record.',
  },
  {
    view: 'all',
    title: 'Protect your account',
    text: 'Open Account settings, enter your current password and generate a recovery code. Save it privately before you ever need to reset a forgotten password.',
    tip: 'The code is shown once and can be used once. Email recovery is not connected. You can reopen this guide from the book button whenever you need a reminder.',
    account: true,
  },
];

function Welcome({ onStart, onSkip }) {
  const ref = useRef(null);
  useModal(ref);
  return (
    <dialog
      ref={ref}
      className="guide-welcome"
      aria-labelledby="guide-welcome-title"
      onCancel={onSkip}
    >
      <div className="dialog-heading">
        <span className="feature-icon">
          <BookOpen aria-hidden="true" size={24} />
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Skip welcome tour"
          onClick={onSkip}
        >
          <X size={20} />
        </button>
      </div>
      <p className="eyebrow">WELCOME TO ORBIT</p>
      <h2 id="guide-welcome-title">A little guidance to get started?</h2>
      <p>
        Take a short tour of your workspace, from your first task to working with a team
        and saving your recovery code.
      </p>
      <p className="small muted">
        You can use Orbit as you learn, choose any topic, minimize the guide or skip
        whenever you like. No sample tasks will be added.
      </p>
      <div className="guide-actions">
        <button type="button" className="button" onClick={onStart}>
          Yes, show me around <ChevronRight size={18} />
        </button>
        <button type="button" className="secondary" onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </dialog>
  );
}

export default function WorkspaceGuide({
  user,
  view,
  busy,
  modalOpen,
  onView,
  onAccount,
}) {
  const trigger = useRef(null),
    heading = useRef(null);
  const storageKey = 'orbit:guide:v1:' + user.id;
  const [guide, setGuide] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (
        ['welcome', 'active', 'dismissed', 'complete'].includes(saved?.status) &&
        Number.isInteger(saved.step) &&
        saved.step >= 0 &&
        saved.step < chapters.length
      )
        return { ...saved, minimized: true };
    } catch {
      /* Storage can be unavailable; the guide still works in this session. */
    }
    return {
      status: user.tourWelcome ? 'welcome' : 'dismissed',
      step: 0,
      minimized: false,
    };
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ status: guide.status, step: guide.step }),
      );
    } catch {
      /* No account data or recovery codes are stored here. */
    }
  }, [storageKey, guide.status, guide.step]);
  const chapter = chapters[guide.step];
  useEffect(() => {
    if (guide.status === 'active' && !guide.minimized && !modalOpen)
      heading.current?.focus();
  }, [guide.status, guide.step, guide.minimized, modalOpen]);
  function move(step) {
    setGuide({ status: 'active', step, minimized: false });
    onView(chapters[step].view);
  }
  function skip() {
    setGuide((value) => ({ ...value, status: 'dismissed' }));
    trigger.current?.focus();
  }
  const active = guide.status === 'active';
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="workspace-guide-button"
        aria-label={active ? 'Continue workspace guide' : 'Open workspace guide'}
        title="Workspace guide"
        disabled={busy || modalOpen}
        onClick={() => move(active ? guide.step : 0)}
      >
        <BookOpen size={18} aria-hidden="true" />
        <span>Guide</span>
      </button>
      {!modalOpen &&
        guide.status === 'welcome' &&
        createPortal(<Welcome onStart={() => move(0)} onSkip={skip} />, document.body)}
      {!modalOpen &&
        active &&
        !guide.minimized &&
        createPortal(
          <aside
            className="workspace-guide"
            aria-labelledby="guide-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                skip();
              }
            }}
          >
            <div className="guide-heading">
              <p className="eyebrow">
                YOUR ORBIT GUIDE · {guide.step + 1} / {chapters.length}
              </p>
              <div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Minimize guide"
                  onClick={() => {
                    setGuide((value) => ({ ...value, minimized: true }));
                    trigger.current?.focus();
                  }}
                >
                  <Minus size={18} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Skip remaining tour"
                  onClick={skip}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <progress
              aria-label="Tour progress"
              max={chapters.length}
              value={guide.step + 1}
            />
            <label className="guide-topic">
              Explore a topic
              <select
                value={guide.step}
                disabled={busy}
                onChange={(event) => move(Number(event.target.value))}
              >
                {chapters.map((item, index) => (
                  <option key={index} value={index}>
                    {index + 1}. {item.title}
                  </option>
                ))}
              </select>
            </label>
            <h2 ref={heading} tabIndex={-1} id="guide-title">
              {chapter.title}
            </h2>
            <p>{chapter.text}</p>
            <p className="guide-tip">{chapter.tip}</p>
            <p className="small muted">
              Try it in your workspace. Minimize this guide whenever you need more room.
            </p>
            {view !== chapter.view && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => onView(chapter.view)}
              >
                Open this view
              </button>
            )}
            {chapter.account && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={onAccount}
              >
                Open Account settings
              </button>
            )}
            <div className="guide-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy || guide.step === 0}
                onClick={() => move(guide.step - 1)}
              >
                <ChevronLeft size={17} /> Back
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() =>
                  guide.step === chapters.length - 1
                    ? (setGuide({ status: 'complete', step: 0, minimized: false }),
                      trigger.current?.focus())
                    : move(guide.step + 1)
                }
              >
                {guide.step === chapters.length - 1 ? 'Finish tour' : 'Next'}
                <ChevronRight size={17} />
              </button>
              <button type="button" className="guide-skip" onClick={skip}>
                Skip tour
              </button>
            </div>
          </aside>,
          document.body,
        )}
    </>
  );
}
