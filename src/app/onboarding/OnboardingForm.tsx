"use client";

import { useActionState, useState } from "react";
import { buttonClass } from "@/components/ui";
import { STATUS_TEMPLATES, type StatusTemplateKey } from "@/lib/status-templates";
import { completeOnboarding, type OnboardingState } from "./actions";
import { COUNTRIES, SPACE_COLORS, TIMEZONES } from "./options";

type AccountType = "agency" | "brand";

const STEPS = ["How you work", "Your workspace", "Your first space"];

function Choice({ checked, onSelect, title, body }: { checked: boolean; onSelect: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${checked ? "border-ink bg-surface ring-1 ring-ink" : "border-line bg-surface hover:border-ink-2"}`}
    >
      <span className="font-semibold">{title}</span>
      <span className="text-sm text-muted">{body}</span>
    </button>
  );
}

const input = "h-11 w-full rounded-lg border border-line bg-surface px-3 text-[15px] outline-none focus:border-ink";

export function OnboardingForm({ firstName }: { firstName: string }) {
  const [step, setStep] = useState(0);
  const [accountType, setAccountType] = useState<AccountType>("agency");
  const [orgName, setOrgName] = useState("");
  const [country, setCountry] = useState("IN");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [spaceName, setSpaceName] = useState("");
  const [spaceColor, setSpaceColor] = useState<string>(SPACE_COLORS[0]);
  const [template, setTemplate] = useState<StatusTemplateKey>("agency");
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, undefined);
  const [localError, setLocalError] = useState<string | null>(null);

  const isAgency = accountType === "agency";
  const currency = country === "IN" ? "INR (₹)" : "USD ($)";

  function next() {
    if (step === 1 && orgName.trim().length < 2) return setLocalError("Give your workspace a name.");
    setLocalError(null);
    if (step === 1 && !isAgency && !spaceName) setSpaceName(orgName.trim());
    setStep(step + 1);
  }

  return (
    <form action={action} className="flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <ol aria-label="Steps" className="flex gap-2">
          {STEPS.map((label, i) => (
            <li key={label} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-ink" : "bg-line"}`} aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">
                Step {i + 1} of {STEPS.length}: {label}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">
          Step {step + 1} of {STEPS.length}
        </p>
      </div>

      {/* Values from every step are submitted together. */}
      <input type="hidden" name="accountType" value={accountType} />
      <input type="hidden" name="orgName" value={orgName} />
      <input type="hidden" name="country" value={country} />
      <input type="hidden" name="timezone" value={timezone} />
      <input type="hidden" name="spaceName" value={spaceName} />
      <input type="hidden" name="spaceColor" value={spaceColor} />
      <input type="hidden" name="template" value={template} />

      {step === 0 && (
        <section className="flex flex-col gap-4">
          <h1 className="font-display text-3xl font-bold">Welcome, {firstName}. How do you work?</h1>
          <p className="text-muted">This sets sensible defaults. You can change everything later.</p>
          <div role="radiogroup" aria-label="Account type" className="grid gap-3 sm:grid-cols-2">
            <Choice
              checked={isAgency}
              onSelect={() => {
                setAccountType("agency");
                setTemplate("agency");
              }}
              title="Agency, I manage clients"
              body="One space per client, with client approval before posts go out."
            />
            <Choice
              checked={!isAgency}
              onSelect={() => {
                setAccountType("brand");
                setTemplate("default");
              }}
              title="Brand or creator, I manage my own"
              body="One space for your brand. You approve your own posts."
            />
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <h1 className="font-display text-3xl font-bold">{isAgency ? "Name your agency" : "Name your workspace"}</h1>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {isAgency ? "Agency name" : "Brand name"}
            <input
              className={`${input} font-normal`}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder={isAgency ? "e.g. KnockKnockClub" : "e.g. Chai Point"}
              maxLength={60}
              autoFocus
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Country
              <select
                className={`${input} font-normal`}
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setTimezone(COUNTRIES.find((c) => c.code === e.target.value)?.timezone ?? "UTC");
                }}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Timezone
              <select className={`${input} font-normal`} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-sm text-muted">Billing currency: {currency}. Posts are scheduled in this timezone unless a space sets its own.</p>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <h1 className="font-display text-3xl font-bold">{isAgency ? "Add your first client" : "Set up your space"}</h1>
          <p className="text-muted">
            {isAgency ? "Each client gets its own space with its accounts, statuses and brand." : "Your accounts, posts and brand live here."}
          </p>
          <div className="flex items-end gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl text-lg font-bold" style={{ background: spaceColor }} aria-hidden>
              {(spaceName.trim()[0] ?? "?").toUpperCase()}
            </span>
            <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
              {isAgency ? "Client name" : "Space name"}
              <input
                className={`${input} font-normal`}
                value={spaceName}
                onChange={(e) => setSpaceName(e.target.value)}
                placeholder={isAgency ? "e.g. Cafe" : "e.g. Chai Point"}
                maxLength={60}
                autoFocus
              />
            </label>
          </div>
          <div role="radiogroup" aria-label="Space colour" className="flex gap-2">
            {SPACE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={spaceColor === c}
                aria-label={`Colour ${c}`}
                onClick={() => setSpaceColor(c)}
                className={`size-8 rounded-full ${spaceColor === c ? "ring-2 ring-ink ring-offset-2" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-semibold">Statuses</legend>
            <div role="radiogroup" className="grid gap-2">
              {(Object.keys(STATUS_TEMPLATES) as StatusTemplateKey[]).map((key) => (
                <Choice
                  key={key}
                  checked={template === key}
                  onSelect={() => setTemplate(key)}
                  title={STATUS_TEMPLATES[key].label}
                  body={STATUS_TEMPLATES[key].description}
                />
              ))}
            </div>
          </fieldset>
        </section>
      )}

      {(localError || state?.error) && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {localError ?? state?.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} className={buttonClass("ghost")}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className={`${buttonClass("primary")} h-11 px-6`}>
            Continue
          </button>
        ) : (
          <button type="submit" disabled={pending || spaceName.trim().length < 2} className={`${buttonClass("primary")} h-11 px-6`}>
            {pending ? "Creating your workspace…" : "Create workspace"}
          </button>
        )}
      </div>
    </form>
  );
}
