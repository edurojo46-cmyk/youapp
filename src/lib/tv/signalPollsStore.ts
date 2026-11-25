const POLLS_STORAGE_KEY = 'youapp_signal_polls_v1';

export interface SignalPollOption {
  id: string;
  label: string;
  votes: number;
}

export interface SignalPoll {
  id: string;
  signalId: string;
  question: string;
  options: SignalPollOption[];
  isOpen: boolean;
  createdAt: string;
  userVotedOptionId?: string | null;
}

function readAllPollsMap(): Record<string, SignalPoll[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(POLLS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAllPollsMap(map: Record<string, SignalPoll[]>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(POLLS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function readSignalPolls(signalId: string): SignalPoll[] {
  const all = readAllPollsMap();
  return Array.isArray(all[signalId]) ? all[signalId] : [];
}

export function createSignalPoll(
  signalId: string,
  question: string,
  optionLabels: string[]
): SignalPoll[] {
  const cleanQ = question.trim();
  const cleanOpts = optionLabels.map((o) => o.trim()).filter(Boolean).slice(0, 4);
  if (!cleanQ || cleanOpts.length < 2) return readSignalPolls(signalId);

  const all = readAllPollsMap();
  const cur = readSignalPolls(signalId);
  const poll: SignalPoll = {
    id: `poll-${Date.now().toString(36)}`,
    signalId,
    question: cleanQ,
    options: cleanOpts.map((label, idx) => ({
      id: `opt-${idx}-${Date.now().toString(36)}`,
      label,
      votes: 0
    })),
    isOpen: true,
    createdAt: new Date().toISOString(),
    userVotedOptionId: null
  };
  const next = [poll, ...cur].slice(0, 20);
  all[signalId] = next;
  writeAllPollsMap(all);
  return next;
}

export function voteSignalPoll(
  signalId: string,
  pollId: string,
  optionId: string
): SignalPoll[] {
  const all = readAllPollsMap();
  const cur = readSignalPolls(signalId);
  const next = cur.map((poll) => {
    if (poll.id !== pollId || !poll.isOpen) return poll;
    const prevChoice = poll.userVotedOptionId;
    if (prevChoice === optionId) return poll;
    return {
      ...poll,
      userVotedOptionId: optionId,
      options: poll.options.map((opt) => {
        if (opt.id === optionId) return { ...opt, votes: opt.votes + 1 };
        if (prevChoice && opt.id === prevChoice) return { ...opt, votes: Math.max(0, opt.votes - 1) };
        return opt;
      })
    };
  });
  all[signalId] = next;
  writeAllPollsMap(all);
  return next;
}

export function toggleSignalPollOpen(signalId: string, pollId: string): SignalPoll[] {
  const all = readAllPollsMap();
  const cur = readSignalPolls(signalId);
  const next = cur.map((p) => (p.id === pollId ? { ...p, isOpen: !p.isOpen } : p));
  all[signalId] = next;
  writeAllPollsMap(all);
  return next;
}

export function deleteSignalPoll(signalId: string, pollId: string): SignalPoll[] {
  const all = readAllPollsMap();
  const cur = readSignalPolls(signalId);
  const next = cur.filter((p) => p.id !== pollId);
  all[signalId] = next;
  writeAllPollsMap(all);
  return next;
}
