import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "../../api";
import { ErrorBox, Loading } from "../../components/States";
import { useMember } from "../../context/AuthContext";
import { useLoad } from "../../hooks/useLoad";
import { todayIn } from "../../lib/dates";
import { RULE_TYPE_LABEL, WEEKDAYS } from "../../lib/rules";
import type { Frequency, Group, Member, Rule, RuleType } from "../../types";

interface FormState {
  type: RuleType;
  title: string;
  description: string;
  frequency: Frequency;
  dayOfWeek: number;
  dayOfMonth: number;
  timeOfDay: string;
  startDate: string;
  targetGroupId: string;
  assigneeIds: string[];
  rotation: string[];
  reminderHoursBefore: string;
}

const TYPES: RuleType[] = ["BIRTHDAY", "ROTATION", "TASK"];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "WEEKLY", label: "Every week" },
  { value: "DAILY", label: "Every day" },
  { value: "MONTHLY", label: "Every month" },
  { value: "ONCE", label: "Once" },
];

function emptyForm(today: string): FormState {
  return {
    type: "ROTATION",
    title: "",
    description: "",
    frequency: "WEEKLY",
    dayOfWeek: 1,
    dayOfMonth: 1,
    timeOfDay: "08:00",
    startDate: today,
    targetGroupId: "",
    assigneeIds: [],
    rotation: [],
    reminderHoursBefore: "",
  };
}

function fromRule(rule: Rule): FormState {
  return {
    type: rule.type,
    title: rule.title,
    description: rule.description ?? "",
    frequency: rule.frequency,
    dayOfWeek: rule.dayOfWeek ?? 1,
    dayOfMonth: rule.dayOfMonth ?? 1,
    timeOfDay: rule.timeOfDay,
    startDate: rule.startDate,
    targetGroupId: rule.targetGroupId ?? "",
    assigneeIds: rule.assigneeIds,
    rotation: rule.rotation,
    reminderHoursBefore: rule.reminderHoursBefore?.toString() ?? "",
  };
}

// The rule itself, without its type (which never changes) or rotation (saved separately)
function toBody(form: FormState) {
  const isTask = form.type === "TASK";
  return {
    title: form.title,
    description: form.description || null,
    frequency: form.frequency,
    dayOfWeek: form.frequency === "WEEKLY" ? form.dayOfWeek : null,
    dayOfMonth: form.frequency === "MONTHLY" ? form.dayOfMonth : null,
    timeOfDay: form.timeOfDay,
    startDate: form.startDate,
    targetGroupId: isTask ? form.targetGroupId || null : null,
    assigneeIds: isTask ? form.assigneeIds : [],
    reminderHoursBefore:
      form.type !== "BIRTHDAY" && form.reminderHoursBefore
        ? Number(form.reminderHoursBefore)
        : null,
  };
}

export function RuleFormPage() {
  const { id } = useParams();
  const { org } = useMember();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loaded = useLoad(async () => {
    const [members, groups, rule] = await Promise.all([
      api<Member[]>("/api/orgs/current/members"),
      api<Group[]>("/api/orgs/current/groups"),
      id ? api<Rule>(`/api/rules/${id}`) : Promise.resolve(null),
    ]);
    return { members, groups, rule };
  }, [id]);

  useEffect(() => {
    if (!loaded.data) return;
    const { rule } = loaded.data;
    setForm(rule ? fromRule(rule) : emptyForm(todayIn(org.timezone)));
  }, [loaded.data, org.timezone]);

  function update(changes: Partial<FormState>) {
    setForm((current) => current && { ...current, ...changes });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;

    if (form.type === "ROTATION" && form.rotation.length === 0) {
      setError("Add at least one person to the rotation.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const body = toBody(form);
      const rule = id
        ? await api<Rule>(`/api/rules/${id}`, { method: "PATCH", body })
        : await api<Rule>("/api/rules", { method: "POST", body: { ...body, type: form.type } });

      if (form.type === "ROTATION") {
        await api(`/api/rules/${rule.id}/rotation`, {
          method: "PUT",
          body: { memberIds: form.rotation },
        });
      }
      navigate("/admin/rules");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (loaded.error) return <ErrorBox message={loaded.error} onRetry={loaded.reload} />;
  if (!form || !loaded.data) return <Loading />;

  const { members, groups } = loaded.data;
  const isBirthday = form.type === "BIRTHDAY";

  return (
    <>
      <div className="page-heading">
        <h1>{id ? "Edit rule" : "New rule"}</h1>
      </div>

      <form className="card form" onSubmit={save}>
        {error && <ErrorBox message={error} />}

        {!id && (
          <fieldset>
            <legend>What kind of rule?</legend>
            <div className="segments">
              {TYPES.map((type) => (
                <label className={form.type === type ? "selected" : ""} key={type}>
                  <input
                    type="radio"
                    name="type"
                    checked={form.type === type}
                    onChange={() => update({ type })}
                  />
                  {RULE_TYPE_LABEL[type]}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label>
          Title
          <input
            required
            maxLength={200}
            value={form.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </label>

        <label>
          Description (optional)
          <textarea
            rows={2}
            maxLength={1000}
            value={form.description}
            onChange={(event) => update({ description: event.target.value })}
          />
        </label>

        {!isBirthday && (
          <label>
            How often?
            <select
              value={form.frequency}
              onChange={(event) => update({ frequency: event.target.value as Frequency })}
            >
              {FREQUENCIES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        {!isBirthday && form.frequency === "WEEKLY" && (
          <label>
            Day of the week
            <select
              value={form.dayOfWeek}
              onChange={(event) => update({ dayOfWeek: Number(event.target.value) })}
            >
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
        )}

        {!isBirthday && form.frequency === "MONTHLY" && (
          <label>
            Day of the month
            <input
              type="number"
              min={1}
              max={31}
              required
              value={form.dayOfMonth}
              onChange={(event) => update({ dayOfMonth: Number(event.target.value) })}
            />
            <small className="muted">Shorter months use their last day.</small>
          </label>
        )}

        <div className="two-columns">
          <label>
            {isBirthday ? "Announce at" : "Due at"}
            <input
              type="time"
              required
              value={form.timeOfDay}
              onChange={(event) => update({ timeOfDay: event.target.value })}
            />
          </label>
          <label>
            {form.frequency === "ONCE" && !isBirthday ? "Date" : "Starts on"}
            <input
              type="date"
              required
              value={form.startDate}
              onChange={(event) => update({ startDate: event.target.value })}
            />
          </label>
        </div>

        {form.type === "ROTATION" && (
          <RotationEditor
            members={members}
            rotation={form.rotation}
            onChange={(rotation) => update({ rotation })}
          />
        )}

        {form.type === "TASK" && (
          <>
            <fieldset>
              <legend>Who is it for?</legend>
              {members.map((member) => (
                <label className="check" key={member.userId}>
                  <input
                    type="checkbox"
                    checked={form.assigneeIds.includes(member.userId)}
                    onChange={(event) =>
                      update({
                        assigneeIds: event.target.checked
                          ? [...form.assigneeIds, member.userId]
                          : form.assigneeIds.filter((userId) => userId !== member.userId),
                      })
                    }
                  />
                  {member.name}
                </label>
              ))}
            </fieldset>

            {groups.length > 0 && (
              <label>
                And/or a whole group
                <select
                  value={form.targetGroupId}
                  onChange={(event) => update({ targetGroupId: event.target.value })}
                >
                  <option value="">No group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {!isBirthday && (
          <label>
            Reminder, hours before (optional)
            <input
              type="number"
              min={1}
              max={720}
              value={form.reminderHoursBefore}
              onChange={(event) => update({ reminderHoursBefore: event.target.value })}
            />
          </label>
        )}

        <div className="actions">
          <button className="button primary" disabled={busy}>
            {busy ? "Saving..." : "Save rule"}
          </button>
          <Link className="button" to="/admin/rules">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}

function RotationEditor(props: {
  members: Member[];
  rotation: string[];
  onChange: (rotation: string[]) => void;
}) {
  const { members, rotation, onChange } = props;

  const nameOf = (userId: string) =>
    members.find((member) => member.userId === userId)?.name ?? "Someone who left";

  const available = members.filter((member) => !rotation.includes(member.userId));

  function move(index: number, by: number) {
    const next = [...rotation];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  }

  return (
    <fieldset>
      <legend>Rotation order</legend>

      {rotation.length > 0 && (
        <ol className="rotation">
          {rotation.map((userId, index) => (
            <li key={userId}>
              <span>{nameOf(userId)}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${nameOf(userId)} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${nameOf(userId)} down`}
                disabled={index === rotation.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${nameOf(userId)}`}
                onClick={() => onChange(rotation.filter((id) => id !== userId))}
              >
                <X aria-hidden size={18} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {available.length > 0 && (
        <select
          aria-label="Add a person to the rotation"
          value=""
          onChange={(event) => onChange([...rotation, event.target.value])}
        >
          <option value="">Add a person...</option>
          {available.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  );
}
