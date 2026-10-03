"use client";

import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileText,
  GraduationCap,
  Heart,
  Home,
  Library,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  Microscope,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { CampusRole } from "@prisma/client";

type ModuleKey =
  | "Home"
  | "Academics"
  | "Coursework"
  | "Announcements"
  | "Messages"
  | "Social"
  | "Events"
  | "Careers"
  | "Campus life"
  | "Parents"
  | "Research"
  | "Administration"
  | "Library"
  | "Fees"
  | "Support"
  | "Specialized"
  | "Analytics";
type ApiData = Record<string, unknown>;
type UserData = { id: string; name: string; email: string };
type InstitutionData = { id: string; name: string; slug: string };
type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "time" | "datetime-local" | "textarea" | "select" | "checkbox";
  required?: boolean;
  min?: number;
  max?: number;
  options?: { label: string; value: string }[];
  placeholder?: string;
};
type Action = {
  title: string;
  endpoint: string | ((values: ActionValues) => string);
  method?: "POST" | "PATCH" | "PUT";
  fields: Field[];
  prepare?: (values: ActionValues) => ApiData;
};
type ActionValues = Record<string, FormDataEntryValue | null | number>;

const sections: {
  key: ModuleKey;
  label: string;
  icon: ReactNode;
  description: string;
}[] = [
  { key: "Home", label: "Overview", icon: <Home size={18} />, description: "Your campus at a glance" },
  { key: "Academics", label: "Academics", icon: <GraduationCap size={18} />, description: "Courses, terms, registration, and timetables" },
  { key: "Coursework", label: "Coursework", icon: <ClipboardList size={18} />, description: "Assignments, submissions, attendance, and exams" },
  { key: "Announcements", label: "Announcements", icon: <Megaphone size={18} />, description: "Official updates for your university community" },
  { key: "Messages", label: "Messages", icon: <MessageCircle size={18} />, description: "Private and group conversations" },
  { key: "Social", label: "Campus social", icon: <Sparkles size={18} />, description: "Share a post, ask the community, and stay connected" },
  { key: "Events", label: "Events", icon: <CalendarDays size={18} />, description: "Discover events and manage attendance" },
  { key: "Careers", label: "Careers", icon: <BriefcaseBusiness size={18} />, description: "Companies, internships, jobs, and applications" },
  { key: "Campus life", label: "Campus life", icon: <Building2 size={18} />, description: "Campus services, transport, housing, and lost & found" },
  { key: "Parents", label: "Family portal", icon: <Users size={18} />, description: "Student-approved academic progress access" },
  { key: "Research", label: "Research", icon: <Microscope size={18} />, description: "Research projects and collaborations" },
  { key: "Administration", label: "Administration", icon: <ShieldCheck size={18} />, description: "Institution, memberships, terms, and departments" },
  { key: "Library", label: "Library", icon: <Library size={18} />, description: "Library catalogue, documents, and certificates" },
  { key: "Fees", label: "Fees & payments", icon: <FileText size={18} />, description: "Invoices, verified payments, receipts, and refund requests" },
  { key: "Support", label: "Help & support", icon: <CircleHelp size={18} />, description: "Contact your campus support team" },
  { key: "Specialized", label: "Medical & law", icon: <BookOpen size={18} />, description: "Clinical placements and legal-education exercises" },
  { key: "Analytics", label: "Analytics", icon: <Search size={18} />, description: "Institution-wide academic and campus insights" },
];

const sectionByKey = new Map(sections.map((section) => [section.key, section]));
const adminRoles: CampusRole[] = [
  CampusRole.DEPARTMENT_CHAIR,
  CampusRole.PRINCIPAL,
  CampusRole.REGISTRAR,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.SUPER_ADMIN,
];
const financeRoles: CampusRole[] = [
  ...adminRoles,
  CampusRole.FINANCE_ADMIN,
];
const departmentRoles: CampusRole[] = [
  CampusRole.DEPARTMENT_HEAD,
  CampusRole.DEPARTMENT_CHAIR,
];
const teacherRoles: CampusRole[] = [
  CampusRole.TEACHER,
  CampusRole.FACULTY,
  ...adminRoles,
  ...departmentRoles,
];
const courseRoles: CampusRole[] = [CampusRole.TEACHER, CampusRole.FACULTY];
const studentRoles: CampusRole[] = [
  CampusRole.STUDENT,
  CampusRole.MEDICAL_STUDENT,
  CampusRole.LAW_STUDENT,
];
const scheduleViewerRoles: CampusRole[] = [
  ...studentRoles,
  CampusRole.PARENT,
  ...adminRoles,
  ...departmentRoles,
  ...courseRoles,
];
const inviteableRoles: CampusRole[] = [
  CampusRole.STUDENT,
  CampusRole.PARENT,
  CampusRole.FACULTY,
  CampusRole.TEACHER,
  CampusRole.DEPARTMENT_CHAIR,
  CampusRole.DEPARTMENT_HEAD,
  CampusRole.PRINCIPAL,
  CampusRole.UNIVERSITY_ADMIN,
  CampusRole.REGISTRAR,
  CampusRole.EXAM_CONTROLLER,
  CampusRole.RECRUITER,
  CampusRole.CAMPUS_BUSINESS,
  CampusRole.MEDICAL_STUDENT,
  CampusRole.LAW_STUDENT,
  CampusRole.SUPER_ADMIN,
];

async function apiRequest(endpoint: string, init?: RequestInit): Promise<ApiData> {
  const response = await fetch(endpoint, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("campushub:unauthorized"));
    }
    const error =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "The request could not be completed.";
    throw new Error(error);
  }
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as ApiData)
    : {};
}

async function loadModuleData(module: ModuleKey, role: CampusRole): Promise<ApiData> {
  const get = (url: string) => apiRequest(url);
  switch (module) {
    case "Home":
      return get("/api/dashboard");
    case "Academics": {
      const [
        courses,
        registration,
        departments,
        programs,
        terms,
        meetings,
        exams,
        transcript,
        faculties,
        academicYears,
        classrooms,
        schedules,
      ] =
        await Promise.all([
          get("/api/courses"),
          studentRoles.includes(role)
            ? get("/api/registration")
            : Promise.resolve({ availableSections: [] }),
          get("/api/departments"),
          get("/api/programs"),
          get("/api/terms"),
          get("/api/meetings"),
          get("/api/exams"),
          studentRoles.includes(role)
            ? get("/api/transcript")
            : Promise.resolve({}),
          get("/api/faculties"),
          get("/api/academic-years"),
          get("/api/classrooms"),
          scheduleViewerRoles.includes(role)
            ? get("/api/schedules")
            : Promise.resolve({ schedules: [] }),
        ]);
      return {
        ...courses,
        ...registration,
        ...departments,
        ...programs,
        ...terms,
        ...meetings,
        ...exams,
        ...transcript,
        ...faculties,
        ...academicYears,
        ...classrooms,
        ...schedules,
      };
    }
    case "Coursework": {
      if (role === CampusRole.EXAM_CONTROLLER) {
        const [courses, exams] = await Promise.all([
          get("/api/courses"),
          get("/api/exams"),
        ]);
        return { ...courses, ...exams };
      }
      const [assignments, courses, meetings, exams] = await Promise.all([
        get("/api/assignments"),
        get("/api/courses"),
        get("/api/meetings"),
        get("/api/exams"),
      ]);
      return { ...assignments, ...courses, ...meetings, ...exams };
    }
    case "Announcements":
      return get("/api/announcements");
    case "Messages": {
      const [messages, officialChannels, directory] = await Promise.all([
        get("/api/messages"),
        get("/api/official-channels"),
        get("/api/directory"),
      ]);
      return { ...messages, ...officialChannels, ...directory };
    }
    case "Social":
      return get("/api/posts");
    case "Events":
      return get("/api/events");
    case "Careers": {
      const [companies, opportunities] = await Promise.all([
        get("/api/companies"),
        get("/api/opportunities"),
      ]);
      return { ...companies, ...opportunities };
    }
    case "Campus life":
      return get("/api/campus");
    case "Parents":
      return get("/api/guardians");
    case "Research":
      return get("/api/research");
    case "Administration": {
      const requests = [
        get("/api/invitations"),
        get("/api/departments"),
        get("/api/programs"),
        get("/api/terms"),
        get("/api/companies"),
        apiRequest("/api/auth/memberships").catch(() => ({})),
      ];
      const reportRoles: CampusRole[] = [
        CampusRole.UNIVERSITY_ADMIN,
        CampusRole.SUPER_ADMIN,
        CampusRole.PRINCIPAL,
      ];
      if (reportRoles.includes(role)) {
        requests.push(get("/api/reports"));
      }
      const [invitations, departments, programs, terms, companies, memberships, reports] =
        await Promise.all(requests);
      return { ...invitations, ...departments, ...programs, ...terms, ...companies, ...memberships, ...reports };
    }
    case "Library":
      return get("/api/campus");
    case "Fees": {
      const financeAccess = financeRoles.includes(role);
      const [legacyFees, finance, transactions, refunds] = await Promise.all([
        adminRoles.includes(role) || studentRoles.includes(role)
          ? get("/api/fees")
          : Promise.resolve({ fees: [] }),
        get("/api/finance/invoices"),
        financeAccess ? get("/api/finance/payments") : Promise.resolve({}),
        financeAccess ? get("/api/finance/refunds") : Promise.resolve({}),
      ]);
      return { ...legacyFees, ...finance, ...transactions, ...refunds };
    }
    case "Support":
      return get("/api/support");
    case "Specialized":
      return get("/api/specialized");
    case "Analytics":
      return get("/api/reports");
  }
}

export default function PlatformDashboard({
  user,
  institution,
  membershipId,
  role: initialRole,
  initialModule,
  paymentOutcome,
}: {
  user: UserData;
  institution: InstitutionData;
  membershipId: string;
  role: CampusRole;
  initialModule?: string;
  paymentOutcome?: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [activeInstitution, setActiveInstitution] = useState(institution);
  const [currentMembershipId, setCurrentMembershipId] = useState(membershipId);
  const [activeModule, setActiveModule] = useState<ModuleKey>(() =>
    initialModule && sectionByKey.has(initialModule as ModuleKey)
      ? (initialModule as ModuleKey)
      : "Home",
  );
  const [data, setData] = useState<ApiData>({});
  const [memberships, setMemberships] = useState<ApiData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(() =>
    paymentOutcome === "succeeded"
      ? "Payment verified. Your receipt is available below."
      : paymentOutcome === "review"
        ? "Payment received and sent to university finance for review."
        : paymentOutcome
          ? "Payment was not confirmed. You can try again from your invoice."
          : "",
  );
  const [search, setSearch] = useState("");
  const [openAction, setOpenAction] = useState<Action | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  const activeSection = sectionByKey.get(activeModule)!;
  const visibleSections = useMemo(() => {
    if (role === CampusRole.PARENT) {
      return sections.filter((section) => ["Home", "Announcements", "Messages", "Social", "Events", "Campus life", "Parents", "Fees", "Support"].includes(section.key));
    }
    if (role === CampusRole.RECRUITER) {
      return sections.filter((section) => ["Home", "Messages", "Social", "Events", "Careers", "Campus life", "Support"].includes(section.key));
    }
    if (role === CampusRole.CAMPUS_BUSINESS) {
      return sections.filter((section) => ["Home", "Messages", "Social", "Events", "Campus life", "Support"].includes(section.key));
    }
    return sections;
  }, [role]);

  const reload = useCallback(async (module: ModuleKey) => {
    setLoading(true);
    setError("");
    try {
      setData(await loadModuleData(module, role));
    } catch (loadError) {
      setData({});
      setError(loadError instanceof Error ? loadError.message : "Could not load this campus area.");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    const redirectToLogin = () => router.push("/login");
    window.addEventListener("campushub:unauthorized", redirectToLogin);
    apiRequest("/api/auth/memberships")
      .then((result) => setMemberships((result.memberships as ApiData[]) ?? []))
      .catch(() => setMemberships([]));
    return () => window.removeEventListener("campushub:unauthorized", redirectToLogin);
  }, [router]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("payment")) {
      url.searchParams.delete("payment");
      window.history.replaceState({}, "", url);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return reload(activeModule);
    });
    return () => { cancelled = true; };
  }, [activeModule, currentMembershipId, reload]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3400);
    return () => window.clearTimeout(timer);
  }, [success]);

  function navigate(module: ModuleKey) {
    setActiveModule(module);
    setMobileNavOpen(false);
    setError("");
    setOpenAction(null);
    const url = new URL(window.location.href);
    if (module === "Home") url.searchParams.delete("module");
    else url.searchParams.set("module", module);
    window.history.replaceState({}, "", url);
  }

  async function act(endpoint: string, method: string, payload?: ApiData) {
    setError("");
    try {
      await apiRequest(endpoint, {
        method,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      setSuccess("Saved successfully.");
      await reload(activeModule);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The action could not be completed.");
    }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openAction) return;
    setSaving(true);
    setError("");
    const values: ActionValues = {};
    for (const field of openAction.fields) {
      const value = new FormData(event.currentTarget).get(field.name);
      values[field.name] =
        field.type === "checkbox"
          ? String(value === "on")
          : field.type === "number" && typeof value === "string"
            ? Number(value)
            : value;
    }
    const payload = openAction.prepare
      ? openAction.prepare(values)
      : Object.fromEntries(
          Object.entries(values).filter(([, value]) => value !== null && value !== ""),
        );
    try {
      const endpoint =
        typeof openAction.endpoint === "function"
          ? openAction.endpoint(values)
          : openAction.endpoint;
      const result = await apiRequest(endpoint, {
        method: openAction.method ?? "POST",
        body: JSON.stringify(payload),
      });
      if (typeof result.checkoutUrl === "string") {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setOpenAction(null);
      setSuccess("Saved successfully.");
      await reload(activeModule);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The action could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(nextMembershipId: string) {
    if (!nextMembershipId || nextMembershipId === currentMembershipId) return;
    try {
      const result = await apiRequest("/api/auth/session", {
        method: "PUT",
        body: JSON.stringify({ membershipId: nextMembershipId }),
      });
      setCurrentMembershipId(nextMembershipId);
      setRole(result.role as CampusRole);
      setActiveInstitution(
        memberships.find((item) => item.id === nextMembershipId)?.institution as InstitutionData ?? institution,
      );
      setSuccess("Campus role changed.");
      navigate("Home");
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Could not switch campus role.");
    }
  }

  async function signOut() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
      router.push("/login");
      router.refresh();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Sign out failed.");
    }
  }

  const actions = actionList(activeModule, role, data);
  const records = objectArrays(data).filter(([key]) =>
    !search ||
    JSON.stringify(data[key]).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <main className="hub-dashboard">
      <header className="hub-topbar">
        <button className="hub-icon-button hub-menu-toggle" aria-label="Open campus navigation" onClick={() => setMobileNavOpen((open) => !open)}>{mobileNavOpen ? <X size={20} /> : <Menu size={20} />}</button>
        <button className="hub-brand" onClick={() => navigate("Home")}>
          <span className="brand-mark"><GraduationCap size={21} /></span>
          <span>campus<span>hub</span></span>
        </button>
        <label className="hub-top-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search loaded campus records..." /><kbd>⌘ K</kbd></label>
        <div className="hub-top-user">
          <span className="hub-user-dot">{initials(user.name)}</span>
          <span className="hub-top-user-name">{user.name}</span>
          <span className="hub-role-label">{roleLabel(role)}</span>
          <button className="hub-icon-button" aria-label="Sign out" onClick={signOut}><LogOut size={17} /></button>
        </div>
      </header>

      <div className="hub-layout">
        <aside className={`hub-sidebar ${mobileNavOpen ? "hub-sidebar-open" : ""}`}>
          <div className="hub-institution-select"><span className="hub-institution-mark"><GraduationCap size={17} /></span><span><b>{activeInstitution.name}</b><small>Verified campus workspace</small></span><ChevronDown size={15} /></div>
          {memberships.length > 1 && (
            <label className="role-switch-label">SWITCH ACTIVE ROLE
              <select value={currentMembershipId} onChange={(event) => void changeRole(event.currentTarget.value)}>
                {memberships.map((item) => {
                  const membership = item as ApiData;
                  const campus = membership.institution as InstitutionData;
                  return <option key={String(membership.id)} value={String(membership.id)}>{roleLabel(membership.role as CampusRole)} · {campus?.name ?? "Campus"}</option>;
                })}
              </select>
            </label>
          )}
          <nav className="hub-navigation" aria-label="CampusHub modules">
            {visibleSections.map((section) => (
              <button key={section.key} className={`hub-nav-item ${activeModule === section.key ? "hub-nav-active" : ""}`} onClick={() => navigate(section.key)}>
                {section.icon}<span>{section.label}</span>{section.key === "Home" && data.unreadNotifications ? <i>{String(data.unreadNotifications)}</i> : null}
              </button>
            ))}
          </nav>
          <div className="hub-sidebar-footer">
            <div className="hub-user-card"><span className="hub-user-dot">{initials(user.name)}</span><span><b>{user.name}</b><small>{roleLabel(role)}</small></span><button className="hub-icon-button" aria-label="Sign out" onClick={signOut}><LogOut size={15} /></button></div>
            <p>Secure campus workspace · SSLCommerz payments</p>
          </div>
        </aside>

        <section className="hub-main">
          <div className="hub-page-heading">
            <div><span className="hub-heading-kicker">{activeInstitution.name.toUpperCase()}</span><h1>{activeModule === "Home" ? `Welcome, ${user.name.split(" ")[0]}.` : activeSection.label}</h1><p>{activeModule === "Home" ? "Your digital campus is all in one place." : activeSection.description}</p></div>
            <div className="hub-heading-badge"><span /><div><b>{roleLabel(role)}</b><small>Active campus role</small></div></div>
          </div>

          {error && <div className="hub-alert hub-alert-error" role="alert"><AlertCircle size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
          {success && <div className="hub-alert hub-alert-success" role="status"><Check size={17} /><span>{success}</span><button onClick={() => setSuccess("")} aria-label="Dismiss status"><X size={15} /></button></div>}

          {loading ? (
            <div className="hub-loading"><span className="loading-spinner" />Loading your campus data…</div>
          ) : (
            <>
              {activeModule === "Home" && <Overview data={data} role={role} navigate={navigate} />}
              {activeModule === "Analytics" && <Analytics data={data} />}
              {activeModule === "Messages" && (
                <MessagesPanel
                        data={data}
                        selectedConversation={selectedConversation}
                        onSelect={setSelectedConversation}
                        onCreate={() => setOpenAction(messageAction(data))}
                      />
              )}
              <div className="hub-actions-row">
                {actions.map((action) => (
                  <button className="hub-primary-button" key={action.title} onClick={() => setOpenAction(action)}><Plus size={16} />{action.title}</button>
                ))}
              </div>
              {activeModule === "Parents" && <GuardianActions data={data} role={role} onAction={act} />}
              {activeModule === "Events" && <p className="hub-context-note"><CalendarDays size={14} />Select an event to register your interest. Event registration records attendance only; it does not collect event fees.</p>}
              {activeModule === "Fees" && <p className="hub-context-note"><ShieldCheck size={14} />Payments are confirmed only after SSLCommerz server-side validation. Receipts are available for verified payments; refund completion is recorded by finance after the gateway refund is processed.</p>}
              {activeModule !== "Home" && activeModule !== "Messages" && activeModule !== "Analytics" && (
                <div className="hub-record-grid">
                  {records.map(([key, items]) => (
                    <RecordSection
                      key={key}
                      title={prettify(key)}
                      items={items as ApiData[]}
                      module={activeModule}
                      role={role}
                      onAction={act}
                    />
                  ))}
                  {!records.length && !error && <EmptyModule activeModule={activeModule} onAction={actions[0] ? () => setOpenAction(actions[0]) : undefined} />}
                </div>
              )}
              {activeModule === "Messages" && !records.length && <EmptyModule activeModule={activeModule} onAction={() => setOpenAction(messageAction(data))} />}
            </>
          )}
          <footer className="hub-main-footer"><span>CampusHub · Secure by institution · Built for your whole campus</span><a href="/README.md" onClick={(event) => event.preventDefault()}>Privacy & safety</a></footer>
        </section>
      </div>

      {openAction && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenAction(null); }}>
          <section className="composer-modal hub-action-modal" role="dialog" aria-modal="true" aria-labelledby="hub-modal-title">
            <div className="modal-heading"><h2 id="hub-modal-title">{openAction.title}</h2><button className="icon-button" aria-label="Close form" onClick={() => setOpenAction(null)}><X size={19} /></button></div>
            <form className="hub-action-form" onSubmit={submitAction}>
              {openAction.fields.map((field) => (
                <label className={`hub-field ${field.type === "textarea" ? "hub-field-wide" : ""}`} key={field.name}>
                  {field.label}
                  {field.type === "textarea" ? (
                    <textarea name={field.name} minLength={field.min} maxLength={field.max} placeholder={field.placeholder} required={field.required !== false} rows={4} />
                  ) : field.type === "select" ? (
                    <select name={field.name} required={field.required !== false} defaultValue="">
                      <option value="" disabled>Select…</option>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <input className="hub-checkbox" type="checkbox" name={field.name} />
                  ) : (
                    <input name={field.name} type={field.type ?? "text"} minLength={field.type === "text" || !field.type ? field.min : undefined} maxLength={field.type === "text" || !field.type ? field.max : undefined} min={field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined} placeholder={field.placeholder} required={field.required !== false} />
                  )}
                </label>
              ))}
              <div className="hub-modal-foot"><span><ShieldCheck size={14} />Available to your active campus role</span><button className="primary-button" disabled={saving}>{saving ? <span className="loading-spinner light-spinner" /> : <Send size={15} />}{saving ? "Saving…" : "Save"}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function actionList(
  module: ModuleKey,
  role: CampusRole,
  data: ApiData,
): Action[] {
  const departments = choiceList(data.departments, (item) => `${item.code ?? ""} ${item.name ?? ""}`.trim());
  const faculties = choiceList(data.faculties, (item) => `${item.code ?? ""} ${item.name ?? ""}`.trim());
  const terms = choiceList(data.terms, (item) => `${item.name ?? ""} · ${String(item.status ?? "")}`);
  const classrooms = choiceList(data.classrooms, (item) => `${item.code ?? ""} ${item.name ?? ""}`.trim());
  const sectionsForCourses = choiceList(data.courses, (item) => {
    const course = item.course as ApiData | undefined;
    return `${course?.code ?? ""} ${course?.title ?? ""} ${item.sectionCode ?? ""}`.trim();
  });
  const companies = choiceList(data.companies, (item) => String(item.name ?? ""));
  const availableRoles = inviteableRoles
    .filter((candidate) => candidate !== CampusRole.SUPER_ADMIN || role === CampusRole.SUPER_ADMIN)
    .map((candidate) => ({ label: roleLabel(candidate), value: candidate }));
  switch (module) {
    case "Academics": {
      const actions: Action[] = [];
      if (adminRoles.includes(role)) {
        actions.push({
          title: "Add faculty",
          endpoint: "/api/faculties",
          fields: [{ name: "name", label: "Faculty name" }, { name: "code", label: "Faculty code" }],
        });
        actions.push({
          title: "Add department",
          endpoint: "/api/departments",
          fields: [
            { name: "facultyId", label: "Faculty", type: "select", options: faculties, required: false },
            { name: "name", label: "Department name", min: 2, max: 120 },
            { name: "code", label: "Department code", min: 2, max: 16 },
          ],
        });
        actions.push({
          title: "Create academic year",
          endpoint: "/api/academic-years",
          fields: [
            { name: "name", label: "Academic year name", placeholder: "2026–2027" },
            { name: "startsAt", label: "Starts", type: "date" },
            { name: "endsAt", label: "Ends", type: "date" },
            { name: "status", label: "Status", type: "select", options: ["PLANNED", "ACTIVE", "COMPLETED"].map((value) => ({ label: prettify(value), value })) },
          ],
        });
        actions.push({
          title: "Create academic term",
          endpoint: "/api/terms",
          fields: [{ name: "name", label: "Term name" }, { name: "startsAt", label: "Starts", type: "date" }, { name: "endsAt", label: "Ends", type: "date" }, { name: "status", label: "Status", type: "select", options: ["PLANNED", "ACTIVE", "COMPLETED"].map((value) => ({ label: prettify(value), value })) }],
        });
        actions.push({
          title: "Create program",
          endpoint: "/api/programs",
          fields: [{ name: "departmentId", label: "Department", type: "select", options: departments }, { name: "name", label: "Program name" }, { name: "code", label: "Program code" }, { name: "level", label: "Degree level", placeholder: "Undergraduate, Master's…" }],
        });
        actions.push({
          title: "Create course section",
          endpoint: "/api/courses",
          fields: [{ name: "departmentId", label: "Department", type: "select", options: departments }, { name: "termId", label: "Academic term", type: "select", options: terms }, { name: "code", label: "Course code" }, { name: "title", label: "Course title" }, { name: "credits", label: "Credits", type: "number", min: 1, max: 30 }, { name: "sectionCode", label: "Section", placeholder: "A" }, { name: "room", label: "Room", required: false }, { name: "description", label: "Description", type: "textarea", required: false }],
        });
        actions.push({
          title: "Add classroom",
          endpoint: "/api/classrooms",
          fields: [
            { name: "code", label: "Room code" },
            { name: "name", label: "Room name" },
            { name: "building", label: "Building", required: false },
            { name: "capacity", label: "Capacity", type: "number", min: 1, required: false },
          ],
        });
      }
      if (departmentRoles.includes(role) && !adminRoles.includes(role)) {
        actions.push(
          {
            title: "Create program",
            endpoint: "/api/programs",
            fields: [
              { name: "departmentId", label: "Department", type: "select", options: departments },
              { name: "name", label: "Program name" },
              { name: "code", label: "Program code" },
              { name: "level", label: "Degree level" },
            ],
          },
          {
            title: "Create course section",
            endpoint: "/api/courses",
            fields: [
              { name: "departmentId", label: "Department", type: "select", options: departments },
              { name: "termId", label: "Academic term", type: "select", options: terms },
              { name: "code", label: "Course code" },
              { name: "title", label: "Course title" },
              { name: "credits", label: "Credits", type: "number", min: 1, max: 30 },
              { name: "sectionCode", label: "Section", placeholder: "A" },
              { name: "room", label: "Room", required: false },
              { name: "description", label: "Description", type: "textarea", required: false },
            ],
          },
        );
      }
      if ([...adminRoles, ...departmentRoles, ...courseRoles].includes(role)) {
        actions.push({
          title: "Add recurring class schedule",
          endpoint: "/api/schedules",
          fields: [
            { name: "sectionId", label: "Course section", type: "select", options: sectionsForCourses },
            { name: "weekday", label: "Weekday", type: "select", options: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map((value) => ({ label: prettify(value), value })) },
            { name: "startsAt", label: "Starts", type: "time" },
            { name: "endsAt", label: "Ends", type: "time" },
            { name: "classroomId", label: "Classroom", type: "select", options: classrooms, required: false },
            { name: "effectiveFrom", label: "Effective from", type: "date", required: false },
            { name: "effectiveUntil", label: "Effective until", type: "date", required: false },
          ],
        });
      }
      if (studentRoles.includes(role)) {
        actions.push({
          title: "Register for a course",
          endpoint: "/api/enrollments",
          fields: [{ name: "sectionId", label: "Available course section", type: "select", options: choiceList(data.availableSections, (item) => { const course = item.course as ApiData | undefined; return `${course?.code ?? ""} · ${course?.title ?? ""} · ${item.sectionCode ?? ""}`; }) }],
        });
      }
      return actions;
    }
    case "Coursework":
      if (teacherRoles.includes(role)) {
        return [
          { title: "Create assignment", endpoint: "/api/assignments", fields: [{ name: "sectionId", label: "Course section", type: "select", options: sectionsForCourses }, { name: "title", label: "Assignment title" }, { name: "instructions", label: "Instructions", type: "textarea" }, { name: "dueAt", label: "Due date", type: "datetime-local" }, { name: "maxPoints", label: "Maximum points", type: "number", min: 1 }] },
          { title: "Schedule class meeting", endpoint: "/api/meetings", fields: [{ name: "sectionId", label: "Course section", type: "select", options: sectionsForCourses }, { name: "title", label: "Class title" }, { name: "startsAt", label: "Starts", type: "datetime-local" }, { name: "endsAt", label: "Ends", type: "datetime-local" }, { name: "room", label: "Room", required: false }] },
          { title: "Schedule exam", endpoint: "/api/exams", fields: [{ name: "sectionId", label: "Course section", type: "select", options: sectionsForCourses }, { name: "title", label: "Exam title" }, { name: "startsAt", label: "Exam time", type: "datetime-local" }, { name: "maxPoints", label: "Maximum points", type: "number", min: 1 }] },
        ];
      }
      if (role === CampusRole.EXAM_CONTROLLER) {
        return [{
          title: "Schedule exam",
          endpoint: "/api/exams",
          fields: [
            { name: "sectionId", label: "Course section", type: "select", options: sectionsForCourses },
            { name: "title", label: "Exam title" },
            { name: "startsAt", label: "Exam time", type: "datetime-local" },
            { name: "maxPoints", label: "Maximum points", type: "number", min: 1 },
          ],
        }];
      }
      if (studentRoles.includes(role)) return [{ title: "Submit assignment", endpoint: (values) => `/api/assignments/${encodeURIComponent(String(values.assignmentId))}/submissions`, fields: [{ name: "assignmentId", label: "Assignment", type: "select", options: choiceList(data.assignments, (item) => `${item.title ?? ""} · ${String(item.dueAt ?? "").slice(0, 10)}`) }, { name: "content", label: "Your submission", type: "textarea" }] }];
      return [];
    case "Announcements":
      return adminRoles.includes(role)
        ? [{ title: "Publish announcement", endpoint: "/api/announcements", fields: [{ name: "title", label: "Headline" }, { name: "body", label: "Announcement", type: "textarea" }, { name: "roles", label: "Audience roles (comma-separated)", required: false, placeholder: "Leave blank for the whole campus" }], prepare: (values) => ({ title: values.title, body: values.body, audienceRoles: typeof values.roles === "string" && values.roles.trim() ? values.roles.split(",").map((item) => item.trim()) : [] }) }]
        : [];
    case "Social":
      return [{
        title: "Create a campus post",
        endpoint: "/api/posts",
        fields: [{ name: "content", label: "What would you like to share?", type: "textarea", min: 1, max: 5000 }],
      }];
    case "Events":
      return teacherRoles.includes(role)
        ? [{ title: "Create campus event", endpoint: "/api/events", fields: [{ name: "title", label: "Event title" }, { name: "description", label: "Details", type: "textarea" }, { name: "location", label: "Location" }, { name: "startsAt", label: "Starts", type: "datetime-local" }, { name: "endsAt", label: "Ends", type: "datetime-local", required: false }] }]
        : [];
    case "Careers": {
      const actions: Action[] = [];
      if (role === CampusRole.RECRUITER || adminRoles.includes(role)) {
        actions.push({
          title: "Create company profile",
          endpoint: "/api/companies",
          fields: [
            { name: "name", label: "Company name" },
            { name: "website", label: "Website", required: false },
            { name: "description", label: "About the company", type: "textarea", required: false },
          ],
        });
        actions.push({
          title: "Post a career opportunity",
          endpoint: "/api/opportunities",
          fields: [
            { name: "companyId", label: "Company", type: "select", options: companies },
            { name: "title", label: "Opportunity title" },
            { name: "type", label: "Type", type: "select", options: ["INTERNSHIP", "JOB", "SCHOLARSHIP", "RESEARCH", "VOLUNTEER"].map((value) => ({ label: prettify(value), value })) },
            { name: "description", label: "Opportunity details", type: "textarea" },
            { name: "location", label: "Location", required: false },
            { name: "closesAt", label: "Apply by", type: "date", required: false },
          ],
        });
      }
      if (studentRoles.includes(role)) {
        actions.push({
          title: "Apply for an opportunity",
          endpoint: (values) => `/api/opportunities/${encodeURIComponent(String(values.opportunityId))}/applications`,
          fields: [
            { name: "opportunityId", label: "Opportunity", type: "select", options: choiceList(data.opportunities, (item) => String(item.title ?? "")) },
            { name: "coverLetter", label: "Cover letter", type: "textarea", required: false },
          ],
        });
      }
      return actions;
    }
    case "Campus life": {
      const actions: Action[] = [
        { title: "Report a lost or found item", endpoint: "/api/lost-found", fields: [{ name: "title", label: "Item" }, { name: "isLost", label: "Status", type: "select", options: [{ label: "I lost an item", value: "true" }, { label: "I found an item", value: "false" }] }, { name: "description", label: "Description", type: "textarea" }, { name: "location", label: "Where was it lost or found?", required: false }] },
      ];
      if (adminRoles.includes(role)) {
        actions.push({
          title: "Add campus service",
          endpoint: "/api/services",
          fields: [
            { name: "name", label: "Service" },
            { name: "category", label: "Category" },
            { name: "description", label: "Details", type: "textarea" },
            { name: "location", label: "Location", required: false },
            { name: "hours", label: "Opening hours", required: false },
            { name: "contact", label: "Contact", required: false },
          ],
        });
      }
      return actions.map((action) => action.title.startsWith("Report")
        ? { ...action, prepare: (values) => ({ ...Object.fromEntries(Object.entries(values)), isLost: values.isLost === "true" }) }
        : action);
    }
    case "Parents":
      return role === CampusRole.PARENT
        ? [{ title: "Request guardian access", endpoint: "/api/guardians", fields: [{ name: "studentEmail", label: "Student's university email", type: "email" }] }]
        : [];
    case "Research":
      return teacherRoles.includes(role)
        ? [{ title: "Share research project", endpoint: "/api/research", fields: [{ name: "title", label: "Project title" }, { name: "abstract", label: "Project summary", type: "textarea" }, { name: "partnerName", label: "External partner institution (optional)", required: false }] }]
        : [];
    case "Administration":
      if (!adminRoles.includes(role)) return [];
      return [
        { title: "Invite campus member", endpoint: "/api/invitations", fields: [{ name: "name", label: "Name" }, { name: "email", label: "Email address", type: "email" }, { name: "role", label: "Campus role", type: "select", options: availableRoles }] },
        { title: "Add department", endpoint: "/api/departments", fields: [{ name: "name", label: "Department name" }, { name: "code", label: "Department code" }] },
        { title: "Create academic term", endpoint: "/api/terms", fields: [{ name: "name", label: "Term name" }, { name: "startsAt", label: "Starts", type: "date" }, { name: "endsAt", label: "Ends", type: "date" }, { name: "status", label: "Status", type: "select", options: ["PLANNED", "ACTIVE", "COMPLETED"].map((value) => ({ label: prettify(value), value })) }] },
      ];
    case "Fees":
      {
        const actions: Action[] = [];
        if (financeRoles.includes(role)) {
          actions.push(
            {
              title: "Create fee structure",
              endpoint: "/api/finance/fee-structures",
              fields: [
                { name: "name", label: "Fee name" },
                { name: "type", label: "Fee type", type: "select", options: ["TUITION", "REGISTRATION", "EXAMINATION", "LABORATORY", "LIBRARY", "HOSTEL", "TRANSPORT", "CERTIFICATE", "OTHER"].map((value) => ({ label: prettify(value), value })) },
                { name: "amount", label: "Amount (BDT)", type: "number", min: 0.01 },
                { name: "description", label: "Description", type: "textarea", required: false },
              ],
            },
            {
              title: "Issue student invoice",
              endpoint: "/api/finance/invoices",
              fields: [
                { name: "studentId", label: "Student", type: "select", options: choiceList(data.students, (item) => `${item.name ?? "Student"} · ${item.email ?? ""}`) },
                { name: "feeStructureId", label: "Fee structure", type: "select", options: choiceList(data.feeStructures, (item) => `${item.name ?? "Fee"} · BDT ${item.amount ?? ""}`) },
                { name: "dueAt", label: "Due date", type: "date" },
              ],
            },
            {
              title: "Record refund outcome",
              endpoint: "/api/finance/refunds",
              method: "PATCH",
              fields: [
                { name: "refundId", label: "Refund request", type: "select", options: choiceList(
                  Array.isArray(data.refunds)
                    ? data.refunds.filter((item) => ["REQUESTED", "PROCESSING"].includes(String(item.status)))
                    : [],
                  (item) => `${(item.payment as ApiData | undefined)?.invoice && ((item.payment as ApiData).invoice as ApiData).invoiceNumber ? String(((item.payment as ApiData).invoice as ApiData).invoiceNumber) : "Invoice"} · BDT ${item.amount ?? ""}`,
                ) },
                { name: "status", label: "Outcome", type: "select", options: [{ label: "Refund completed at gateway", value: "COMPLETED" }, { label: "Reject request", value: "REJECTED" }] },
                { name: "gatewayRefundReference", label: "Gateway refund reference (completed only)", required: false },
              ],
              prepare: (values) => ({
                refundId: values.refundId,
                status: values.status,
                ...(typeof values.gatewayRefundReference === "string" && values.gatewayRefundReference
                  ? { gatewayRefundReference: values.gatewayRefundReference }
                  : {}),
              }),
            },
          );
        }
        if (studentRoles.includes(role) || role === CampusRole.PARENT) {
          actions.push({
            title: "Pay an open invoice",
            endpoint: "/api/finance/payments",
            fields: [
              { name: "invoiceId", label: "Invoice", type: "select", options: choiceList(
                Array.isArray(data.invoices)
                  ? data.invoices.filter((item) => ["ISSUED", "PARTIALLY_PAID"].includes(String(item.status)))
                  : [],
                (item) => `${item.invoiceNumber ?? "Invoice"} · BDT ${(
                  Number(item.totalAmount ?? 0) - Number(item.paidAmount ?? 0)
                ).toFixed(2)} due (${prettify(String(item.status ?? ""))})`,
              ) },
              { name: "customerPhone", label: "Billing phone" },
              { name: "customerAddress", label: "Billing address" },
              { name: "customerCity", label: "City" },
              { name: "customerPostcode", label: "Postal code" },
              { name: "customerCountry", label: "Country" },
            ],
          });
          actions.push({
            title: "Request a refund",
            endpoint: "/api/finance/refunds",
            fields: [
              { name: "paymentId", label: "Verified payment", type: "select", options: choiceList(data.payments, (item) => `${(item.invoice as ApiData | undefined)?.invoiceNumber ?? "Invoice"} · BDT ${item.amount ?? ""}`) },
              { name: "amount", label: "Requested amount (BDT)", type: "number", min: 0.01 },
              { name: "reason", label: "Reason", type: "textarea", min: 3, max: 1000 },
            ],
          });
        }
        return actions;
      }
    case "Support":
      return [{ title: "Create help request", endpoint: "/api/support", fields: [{ name: "subject", label: "Subject" }, { name: "description", label: "How can we help?", type: "textarea" }] }];
    case "Specialized":
      if (role === CampusRole.LAW_STUDENT) return [{ title: "Log legal-education exercise", endpoint: "/api/specialized", fields: [{ name: "caseTitle", label: "Moot court or clinic exercise" }, { name: "clinic", label: "Clinic or course" }, { name: "caseReference", label: "Course exercise reference (no client data)", required: false }] }];
      if (teacherRoles.includes(role)) return [{ title: "Assign medical placement", endpoint: "/api/specialized", fields: [{ name: "studentId", label: "Medical student account ID" }, { name: "organization", label: "Placement provider" }, { name: "specialty", label: "Specialty" }, { name: "startsAt", label: "Starts", type: "date" }, { name: "endsAt", label: "Ends", type: "date" }] }];
      return [];
    default:
      return [];
  }
}

function messageAction(data: ApiData): Action {
  const members = choiceList(data.members, (item) => {
    const roles = Array.isArray(item.roles)
      ? item.roles.map((role) => roleLabel(role)).join(", ")
      : "";
    return `${String(item.name ?? "Campus member")} · ${roles}`;
  });
  return {
    title: "Start a campus conversation",
    endpoint: "/api/messages",
    fields: [
      { name: "memberId", label: "Campus member", type: "select", options: members },
      { name: "kind", label: "Conversation type", type: "select", options: ["DIRECT", "GROUP"].map((value) => ({ label: prettify(value), value })) },
      { name: "title", label: "Group name", required: false },
    ],
    prepare: (values) => ({
      memberIds: typeof values.memberId === "string" ? [values.memberId] : [],
      kind: values.kind,
      ...(typeof values.title === "string" && values.title ? { title: values.title } : {}),
    }),
  };
}

function Overview({
  data,
  role,
  navigate,
}: {
  data: ApiData;
  role: CampusRole;
  navigate: (module: ModuleKey) => void;
}) {
  const metrics = data.metrics as ApiData | undefined;
  const courses = Array.isArray(data.courses) ? data.courses as ApiData[] : [];
  const children = Array.isArray(data.children) ? data.children as ApiData[] : [];
  const assignments = Array.isArray(data.upcomingAssignments)
    ? data.upcomingAssignments as ApiData[]
    : children.flatMap((student) =>
        Array.isArray(student.upcomingAssignments)
          ? student.upcomingAssignments as ApiData[]
          : [],
      );
  const sectionsData = Array.isArray(data.sections) ? data.sections as ApiData[] : [];
  const cards =
    metrics && adminRoles.includes(role)
      ? [
          { label: "Active students", value: metric(metrics.students), icon: <Users size={18} />, tint: "tint-blue" },
          { label: "Faculty", value: metric(metrics.faculty), icon: <GraduationCap size={18} />, tint: "tint-green" },
          { label: "Departments", value: metric(metrics.departments), icon: <Building2 size={18} />, tint: "tint-lilac" },
          { label: "Active course sections", value: metric(metrics.activeCourses), icon: <BookOpen size={18} />, tint: "tint-orange" },
        ]
      : role === CampusRole.PARENT
        ? [
            { label: "Linked students", value: String(children.length), icon: <Users size={18} />, tint: "tint-blue" },
            { label: "Unread notifications", value: metric(data.unreadNotifications), icon: <Megaphone size={18} />, tint: "tint-orange" },
          ]
        : courseRoles.includes(role)
          ? [
              { label: "Active course sections", value: String(sectionsData.length), icon: <BookOpen size={18} />, tint: "tint-blue" },
              { label: "Assignments", value: String(assignments.length), icon: <ClipboardList size={18} />, tint: "tint-green" },
              { label: "Unread notifications", value: metric(data.unreadNotifications), icon: <Megaphone size={18} />, tint: "tint-orange" },
            ]
          : departmentRoles.includes(role)
            ? [
                { label: "Students in scope", value: metric(metrics?.students), icon: <Users size={18} />, tint: "tint-blue" },
                { label: "Departments", value: metric(metrics?.departments), icon: <Building2 size={18} />, tint: "tint-lilac" },
                { label: "Active course sections", value: metric(metrics?.activeCourses), icon: <BookOpen size={18} />, tint: "tint-green" },
                { label: "Unread notifications", value: metric(metrics?.unreadNotifications), icon: <Megaphone size={18} />, tint: "tint-orange" },
              ]
            : studentRoles.includes(role)
            ? [
              { label: "Enrolled courses", value: String(courses.length), icon: <BookOpen size={18} />, tint: "tint-blue" },
              { label: "Attendance", value: data.attendanceRate == null ? "—" : `${String(data.attendanceRate)}%`, icon: <Check size={18} />, tint: "tint-green" },
              { label: "GPA", value: data.gpa == null ? "—" : String(data.gpa), icon: <GraduationCap size={18} />, tint: "tint-lilac" },
              { label: "Unread notifications", value: metric(data.unreadNotifications), icon: <Megaphone size={18} />, tint: "tint-orange" },
              ]
            : [
                {
                  label:
                    role === CampusRole.EXAM_CONTROLLER
                      ? "Exams"
                      : role === CampusRole.FINANCE_ADMIN
                        ? "Fee records"
                        : role === CampusRole.LIBRARIAN
                          ? "Library items"
                          : role === CampusRole.HOSTEL_MANAGER
                            ? "Hostel buildings"
                            : role === CampusRole.TRANSPORT_MANAGER
                              ? "Transit routes"
                              : "Unread notifications",
                  value: metric(
                    role === CampusRole.EXAM_CONTROLLER
                      ? metrics?.exams
                      : role === CampusRole.FINANCE_ADMIN
                        ? metrics?.feeRecords
                        : role === CampusRole.LIBRARIAN
                          ? metrics?.libraryItems
                          : role === CampusRole.HOSTEL_MANAGER
                            ? metrics?.hostelBuildings
                            : role === CampusRole.TRANSPORT_MANAGER
                              ? metrics?.transitRoutes
                              : metrics?.unreadNotifications,
                  ),
                  icon: <Building2 size={18} />,
                  tint: "tint-blue",
                },
                ...(role === CampusRole.FINANCE_ADMIN
                  ? [
                      {
                        label: "Informational fees due",
                        value: metric(metrics?.feesDue),
                        icon: <ClipboardList size={18} />,
                        tint: "tint-orange",
                      },
                    ]
                  : []),
                { label: "Unread notifications", value: metric(metrics?.unreadNotifications), icon: <Megaphone size={18} />, tint: "tint-orange" },
              ];
  return (
    <div className="hub-overview">
      <div className="hub-metric-grid">{cards.map((card) => <div className="hub-metric-card" key={card.label}><span className={`hub-metric-icon ${card.tint}`}>{card.icon}</span><b>{card.value}</b><small>{card.label}</small></div>)}</div>
      <div className="hub-overview-grid">
        <section className="hub-panel hub-quick-panel"><div className="hub-panel-heading"><div><h2>Go to your campus</h2><p>Everything important, one shared workspace.</p></div><Sparkles size={19} /></div><div className="hub-quick-links">{(["Academics", "Social", "Events", "Messages", "Careers", "Campus life"] as ModuleKey[]).map((key) => { const item = sectionByKey.get(key)!; return <button key={key} onClick={() => navigate(key)}><span>{item.icon}</span><b>{item.label}</b><ChevronRight size={15} /></button>; })}</div></section>
        <section className="hub-panel"><div className="hub-panel-heading"><div><h2>{role === CampusRole.PARENT ? "Linked students" : courseRoles.includes(role) ? "Teaching sections" : "Your courses"}</h2><p>{role === CampusRole.PARENT ? "Only approved links reveal academic details." : "A snapshot from your active institution."}</p></div><button className="hub-inline-link" onClick={() => navigate(role === CampusRole.PARENT ? "Parents" : "Academics")}>View <ArrowRight size={14} /></button></div>
          {role === CampusRole.PARENT ? <CompactList items={children} primary="name" secondary="email" empty="No student links yet. Ask your student to approve your guardian request." /> : <CompactList items={courses.length ? courses : sectionsData} primary="title" secondary="code" empty="No active course data yet. Academic records appear here after your institution configures its terms and registration." />}
        </section>
        {role === CampusRole.PARENT && <ParentAcademicSummaries students={children} />}
        <section className="hub-panel"><div className="hub-panel-heading"><div><h2>Due soon</h2><p>Upcoming assignments from enrolled classes.</p></div><button className="hub-inline-link" onClick={() => navigate("Coursework")}>Coursework <ArrowRight size={14} /></button></div><CompactList items={assignments} primary="title" secondary="dueAt" empty="You are all caught up. New course assignments will appear here." /></section>
        <section className="hub-safety-panel"><ShieldCheck size={18} /><div><b>Designed for a trusted campus</b><p>Institution roles protect private academic records; guardian access requires student approval. Ordinary chats stay separate from official, audited announcements.</p></div></section>
      </div>
    </div>
  );
}

function ParentAcademicSummaries({ students }: { students: ApiData[] }) {
  if (!students.length) return null;
  return (
    <section className="hub-panel hub-data-panel-wide">
      <div className="hub-panel-heading">
        <div><h2>Academic progress</h2><p>Approved records for each linked student.</p></div>
      </div>
      <div className="hub-record-grid">
        {students.map((student, index) => {
          const profile = student.studentProfile as ApiData | undefined;
          const currentTerm = profile?.currentTerm as ApiData | undefined;
          const enrollments = Array.isArray(student.enrollments)
            ? student.enrollments as ApiData[]
            : [];
          const courses = enrollments.flatMap((enrollment) => {
            const section = enrollment.section as ApiData | undefined;
            const course = section?.course as ApiData | undefined;
            return course ? [course] : [];
          });
          const assignments = Array.isArray(student.upcomingAssignments)
            ? student.upcomingAssignments as ApiData[]
            : [];
          const results = Array.isArray(student.results)
            ? student.results as ApiData[]
            : [];
          const fees = Array.isArray(student.fees) ? student.fees as ApiData[] : [];
          const attendance = Array.isArray(student.attendance)
            ? student.attendance as ApiData[]
            : [];
          return (
            <article className="hub-panel" key={String(student.id ?? index)}>
              <div className="hub-panel-heading">
                <div>
                  <h3>{String(student.name ?? "Student")}</h3>
                  <p>
                    {profile?.studentNumber ? `Student no. ${String(profile.studentNumber)}` : "Student profile"}
                    {currentTerm?.name ? ` · ${String(currentTerm.name)}` : ""}
                    {profile?.academicStatus ? ` · ${prettify(String(profile.academicStatus))}` : ""}
                  </p>
                </div>
                <span className="hub-count-pill">
                  {student.attendanceRate == null ? "—" : `${String(student.attendanceRate)}% attendance`}
                </span>
              </div>
              <h4>Enrolled courses</h4>
              <CompactList items={courses} primary="title" secondary="code" empty="No enrolled courses." />
              <h4>Upcoming assignments</h4>
              <CompactList items={assignments} primary="title" secondary="dueAt" empty="No upcoming assignments." />
              <h4>Released results</h4>
              <CompactList
                items={results.map((result) => {
                  const exam = result.exam as ApiData | undefined;
                  const section = exam?.section as ApiData | undefined;
                  const course = section?.course as ApiData | undefined;
                  return {
                    title: String(exam?.title ?? course?.title ?? "Exam"),
                    code: `${String(result.points ?? "—")} points`,
                  };
                })}
                primary="title"
                secondary="code"
                empty="No released results."
              />
              <h4>Fee information</h4>
              <CompactList
                items={fees.map((fee) => ({
                  title: String(fee.description ?? "Fee record"),
                  code: `${String(fee.amountDue ?? "—")} ${String(fee.currency ?? "")}`,
                }))}
                primary="title"
                secondary="code"
                empty="No fee records."
              />
              <h4>Recent attendance</h4>
              <CompactList
                items={attendance.map((record) => {
                  const meeting = record.meeting as ApiData | undefined;
                  const section = meeting?.section as ApiData | undefined;
                  const course = section?.course as ApiData | undefined;
                  return {
                    title: String(course?.title ?? "Class"),
                    code: prettify(String(record.status ?? "unknown")),
                  };
                })}
                primary="title"
                secondary="code"
                empty="No attendance has been recorded."
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RecordSection({
  title,
  items,
  module,
  role,
  onAction,
}: {
  title: string;
  items: ApiData[];
  module: ModuleKey;
  role: CampusRole;
  onAction: (endpoint: string, method: string, payload?: ApiData) => void;
}) {
  if (!items.length) {
    return <section className="hub-panel hub-empty-panel"><h2>{title}</h2><p>Nothing to show here yet.</p></section>;
  }
  const sectionKey = title.toLowerCase().replaceAll(" ", "");
  return (
    <section className={`hub-panel hub-data-panel ${items.length > 4 ? "hub-data-panel-wide" : ""}`}>
      <div className="hub-panel-heading"><div><h2>{title}</h2><p>{items.length} {items.length === 1 ? "record" : "records"}</p></div><span className="hub-count-pill">{items.length}</span></div>
      <div className="hub-record-list">
        {items.slice(0, 40).map((item, index) => {
          const identifier = stringField(item, "id") ?? `${sectionKey}-${index}`;
          const itemTitle = recordTitle(item);
          const itemSubtitle = recordSubtitle(item);
          const isEvent = sectionKey === "events";
          const isPost = sectionKey === "posts";
          const isInvitation = sectionKey === "invitations";
          const isOpportunity = sectionKey === "opportunities";
          const isLostFound = sectionKey === "lostandfound" || sectionKey === "posts" && module === "Campus life";
          const isLink = sectionKey === "links";
          const currentUserRsvp = Array.isArray(item.rsvps) && item.rsvps.length > 0;
          const currentUserReaction = Array.isArray(item.reactions) && item.reactions.length > 0;
          return (
            <article className="hub-record" key={identifier}>
              <span className={`hub-record-symbol ${moduleTint(module)}`}>{module === "Events" ? <CalendarDays size={16} /> : module === "Academics" || module === "Coursework" ? <BookOpen size={16} /> : module === "Messages" ? <MessageCircle size={16} /> : <FileText size={16} />}</span>
              <div className="hub-record-main">
                <b>{itemTitle}</b>
                {itemSubtitle && <span>{itemSubtitle}</span>}
                <small>{recordMeta(item)}</small>
              </div>
              {isEvent && <button className={`hub-record-action ${currentUserRsvp ? "hub-action-active" : ""}`} onClick={() => { void onAction("/api/events", "PATCH", { eventId: item.id }); }}>{currentUserRsvp ? <><Check size={13} />Going</> : "I'm interested"}</button>}
              {isPost && <button className={`hub-record-action ${currentUserReaction ? "hub-action-active" : ""}`} onClick={() => { void onAction(`/api/posts/${encodeURIComponent(String(item.id))}/reaction`, "PUT", { kind: "LIKE" }); }}><Heart size={13} />{Number((item._count as ApiData | undefined)?.reactions ?? 0)} Like</button>}
              {isInvitation && <button className="hub-record-action" onClick={() => { void onAction(`/api/invitations/${encodeURIComponent(String(item.id))}`, "POST"); }}>Resend invite</button>}
              {isOpportunity && studentRoles.includes(role) && <button className="hub-record-action" onClick={() => onAction(`/api/opportunities/${encodeURIComponent(String(item.id))}/applications`, "POST", { coverLetter: "" })}>Apply</button>}
              {isLostFound && <button className="hub-record-action" onClick={() => { void onAction("/api/lost-found", "PATCH", { postId: item.id, status: "CLAIMED" }); }}>Claim item</button>}
              {isLink && role === CampusRole.STUDENT && !item.verifiedAt && <div className="hub-record-buttons"><button className="hub-record-action" onClick={() => { void onAction("/api/guardians", "PATCH", { guardianId: (item.guardian as ApiData | undefined)?.id, approve: true }); }}>Approve</button><button className="hub-record-action muted-action" onClick={() => { void onAction("/api/guardians", "PATCH", { guardianId: (item.guardian as ApiData | undefined)?.id, approve: false }); }}>Deny</button></div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MessagesPanel({
  data,
  selectedConversation,
  onSelect,
  onCreate,
}: {
  data: ApiData;
  selectedConversation: string | null;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
}) {
  const conversations = Array.isArray(data.conversations) ? data.conversations as ApiData[] : [];
  const channels = Array.isArray(data.channels) ? data.channels as ApiData[] : [];
  const [content, setContent] = useState("");
  const [messages, setMessages] = useState<ApiData[]>([]);
  const [threadError, setThreadError] = useState("");
  const activeConversation = conversations.find((conversation) => conversation.id === selectedConversation);
  useEffect(() => {
    if (!selectedConversation) return;
    apiRequest(`/api/messages/${encodeURIComponent(selectedConversation)}`)
      .then((result) => {
        setThreadError("");
        const loaded = (result.messages as ApiData[]) ?? [];
        setMessages(loaded);
        const unreadIds = loaded
          .filter((message) => Array.isArray(message.receipts) && !(message.receipts as ApiData[])[0]?.readAt)
          .map((message) => message.id)
          .filter((id): id is string => typeof id === "string");
        if (unreadIds.length) {
          void apiRequest("/api/messages", {
            method: "PATCH",
            body: JSON.stringify({ conversationId: selectedConversation, messageIds: unreadIds }),
          }).catch((readError) => setThreadError(readError instanceof Error ? readError.message : "Could not update read status."));
        }
      })
      .catch((loadError) => setThreadError(loadError instanceof Error ? loadError.message : "Could not load messages."));
  }, [selectedConversation]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation || !content.trim()) return;
    const text = content.trim();
    setThreadError("");
    try {
      const result = await apiRequest(`/api/messages/${encodeURIComponent(selectedConversation)}`, {
        method: "POST",
        body: JSON.stringify({ content: text }),
      });
      const newMessage = result.message as ApiData | undefined;
      if (newMessage) setMessages((current) => [...current, newMessage]);
    } catch (sendError) {
      setThreadError(sendError instanceof Error ? sendError.message : "Message could not be sent.");
      return;
    }
    setContent("");
  }
  return (
    <div className="hub-message-layout">
      <section className="hub-panel hub-conversation-list">
        <div className="hub-panel-heading"><div><h2>Conversations</h2><p>Private campus conversations</p></div><button className="hub-icon-button" aria-label="Start conversation" onClick={onCreate}><Plus size={18} /></button></div>
        {conversations.length ? conversations.map((conversation) => {
          const members = Array.isArray(conversation.members) ? conversation.members as ApiData[] : [];
          const people = members.map((member) => (member.user as ApiData | undefined)?.name).filter(Boolean);
          const latest = Array.isArray(conversation.messages) ? (conversation.messages as ApiData[])[0] : undefined;
          return <button className={`hub-conversation-item ${selectedConversation === conversation.id ? "conversation-selected" : ""}`} key={String(conversation.id)} onClick={() => onSelect(String(conversation.id))}><span className="hub-user-dot">{initials(String(people.join(", ") || conversation.title || "Campus"))}</span><span><b>{String(conversation.title || people.filter((name) => name !== "Me").join(", ") || "Campus conversation")}</b><small>{String(latest?.content ?? "No messages yet")}</small></span><ArrowRight size={14} /></button>;
        }) : <div className="hub-inline-empty">No conversations yet. Start one with another campus member.</div>}
        <div className="hub-official-separator"><ShieldCheck size={14} /><b>Official / audited channels</b></div>
        {channels.length ? channels.map((channel) => <div className="hub-official-channel" key={String(channel.id)}><span><ShieldCheck size={15} /></span><b>{String(channel.name)}</b><small>{String((channel._count as ApiData | undefined)?.messages ?? 0)} updates</small></div>) : <p className="hub-muted-copy">Administrators can create official channels. These are kept separate from normal chats.</p>}
      </section>
      <section className="hub-panel hub-message-thread">
        {activeConversation ? <>
          <div className="hub-panel-heading"><div><h2>{String(activeConversation.title ?? "Campus conversation")}</h2><p>Private message thread</p></div><button className="hub-icon-button" onClick={() => onSelect(null)} aria-label="Close conversation"><X size={17} /></button></div>
          <div className="hub-thread-scroll">
            {messages.map((message) => <div className="hub-message-bubble" key={String(message.id)}><b>{String((message.sender as ApiData | undefined)?.name ?? "Campus member")}</b><p>{String(message.content ?? "")}</p><small>{new Date(String(message.createdAt)).toLocaleString()}</small></div>)}
            {threadError && <span className="hub-inline-error">{threadError}</span>}
          </div>
          <form className="hub-message-compose" onSubmit={send}><input value={content} onChange={(event) => setContent(event.target.value)} maxLength={10000} placeholder="Write a message…" required /><button className="primary-button" disabled={!content.trim()}><Send size={15} />Send</button></form>
        </> : <div className="hub-thread-empty"><MessageCircle size={27} /><b>Your campus conversations</b><span>Select a conversation or start a new one.</span><button className="hub-primary-button" onClick={onCreate}><Plus size={15} />Start a conversation</button></div>}
      </section>
    </div>
  );
}

function GuardianActions({ data, role, onAction }: { data: ApiData; role: CampusRole; onAction: (endpoint: string, method: string, payload?: ApiData) => void }) {
  const links = Array.isArray(data.links) ? data.links as ApiData[] : [];
  if (role !== CampusRole.STUDENT || !links.some((link) => !link.verifiedAt)) return null;
  return <div className="hub-panel hub-guardian-banner"><ShieldCheck size={18} /><div><b>Guardian access requests</b><span>Approve or deny each family member individually. Academic data remains private until you approve.</span></div>{links.filter((link) => !link.verifiedAt).map((link) => <button className="hub-primary-button" key={String(link.guardianId)} onClick={() => onAction("/api/guardians", "PATCH", { guardianId: link.guardianId, approve: true })}>Approve {String((link.guardian as ApiData | undefined)?.name ?? "guardian")}</button>)}</div>;
}

function Analytics({ data }: { data: ApiData }) {
  const roles = Array.isArray(data.membersByRole) ? data.membersByRole as ApiData[] : [];
  const terms = Array.isArray(data.terms) ? data.terms as ApiData[] : [];
  const attendance = Array.isArray(data.attendanceByStatus) ? data.attendanceByStatus as ApiData[] : [];
  const metrics = [
    ["Active enrollments", data.enrollmentCount],
    ["Assignments", data.assignmentCount],
    ["Career applications", data.applicationCount],
    ["Campus events", data.eventCount],
  ];
  return <div className="hub-analytics-grid"><div className="hub-metric-grid">{metrics.map(([label, value]) => <div className="hub-metric-card" key={String(label)}><span className="hub-metric-icon tint-green"><Sparkles size={17} /></span><b>{metric(value)}</b><small>{String(label)}</small></div>)}</div><RecordSection title="Membership by role" items={roles} module="Analytics" role={CampusRole.UNIVERSITY_ADMIN} onAction={() => {}} /><RecordSection title="Academic terms" items={terms} module="Academics" role={CampusRole.UNIVERSITY_ADMIN} onAction={() => {}} /><RecordSection title="Attendance" items={attendance} module="Coursework" role={CampusRole.UNIVERSITY_ADMIN} onAction={() => {}} /></div>;
}

function EmptyModule({ activeModule, onAction }: { activeModule: ModuleKey; onAction?: () => void }) {
  return <div className="hub-empty-state"><span>{sectionByKey.get(activeModule)?.icon}</span><h2>Start building your {activeModule.toLowerCase()} space.</h2><p>When campus data is added, it will appear here. Choose an action to get started or invite your campus team.</p>{onAction && <button className="hub-primary-button" onClick={onAction}><Plus size={15} />Get started</button>}</div>;
}

function CompactList({ items, primary, secondary, empty }: { items: ApiData[]; primary: string; secondary: string; empty: string }) {
  return items.length ? <div className="hub-compact-list">{items.slice(0, 5).map((item, index) => { const course = item.course as ApiData | undefined; return <div className="hub-compact-item" key={String(item.id ?? index)}><span className="compact-dot" /><span><b>{String(item[primary] ?? course?.[primary] ?? course?.title ?? item.title ?? "Campus record")}</b><small>{String(item[secondary] ?? course?.code ?? item.sectionCode ?? item.term?.toString?.() ?? "")}</small></span></div>; })}</div> : <p className="hub-inline-empty">{empty}</p>;
}

function objectArrays(data: ApiData): [string, ApiData[]][] {
  return Object.entries(data).filter((entry): entry is [string, ApiData[]] => Array.isArray(entry[1]) && (entry[1] as unknown[]).every((item) => item !== null && typeof item === "object" && !Array.isArray(item)));
}

function choiceList(value: unknown, label: (item: ApiData) => string) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || typeof (item as ApiData).id !== "string") return [];
    return [{ value: (item as ApiData).id as string, label: label(item as ApiData) }];
  });
}

function recordTitle(item: ApiData) {
  const course = item.course as ApiData | undefined;
  const student = item.student as ApiData | undefined;
  const payment = item.payment as ApiData | undefined;
  const invoice = item.invoice as ApiData | undefined;
  const receipt = item.receipt as ApiData | undefined;
  const paymentReceipt = payment?.receipt as ApiData | undefined;
  const paymentInvoice = payment?.invoice as ApiData | undefined;
  const opportunity = item.opportunity as ApiData | undefined;
  return String(
    item.invoiceNumber ??
      invoice?.invoiceNumber ??
      paymentInvoice?.invoiceNumber ??
      receipt?.receiptNumber ??
      paymentReceipt?.receiptNumber ??
      item.receiptNumber ??
      payment?.transactionId ??
      item.transactionId ??
      item.title ??
      item.name ??
      item.subject ??
      item.caseTitle ??
      item.question ??
      student?.name ??
      opportunity?.title ??
      course?.title ??
      course?.code ??
      item.code ??
      item.type ??
      item.status ??
      "Campus record",
  );
}

function recordSubtitle(item: ApiData) {
  const course = item.course as ApiData | undefined;
  const company = item.company as ApiData | undefined;
  const creator = item.creator as ApiData | undefined;
  const author = item.author as ApiData | undefined;
  const institution = item.institution as ApiData | undefined;
  const event = item.event as ApiData | undefined;
  const invoice = item.invoice as ApiData | undefined;
  const payment = item.payment as ApiData | undefined;
  const paymentInvoice = payment?.invoice as ApiData | undefined;
  const receipt = item.receipt as ApiData | undefined;
  const paymentReceipt = payment?.receipt as ApiData | undefined;
  return String(item.description ?? item.reason ?? item.content ?? item.body ?? item.location ?? item.category ?? item.email ?? receipt?.receiptNumber ?? paymentReceipt?.receiptNumber ?? company?.name ?? creator?.name ?? author?.name ?? institution?.name ?? invoice?.invoiceNumber ?? paymentInvoice?.invoiceNumber ?? course?.code ?? event?.title ?? "");
}

function recordMeta(item: ApiData) {
  const primary = [item.status, item.role, item.startsAt, item.dueAt, item.closesAt, item.createdAt, item.verifiedAt ? "Verified" : null, item.amountDue != null ? `${String(item.currency ?? "")} ${String(item.amountDue)} due` : null, item.totalAmount != null ? `${String(item.currency ?? "")} ${String(item.totalAmount)} total` : null, item.paidAmount != null ? `${String(item.currency ?? "")} ${String(item.paidAmount)} paid` : null, item.amount != null ? `${String(item.currency ?? "BDT")} ${String(item.amount)}` : null].filter((value): value is string | number => typeof value === "string" || typeof value === "number");
  return primary.map((value) => typeof value === "string" && value.includes("T") ? new Date(value).toLocaleString() : String(value)).join(" · ");
}

function stringField(item: ApiData, field: string) {
  return typeof item[field] === "string" ? item[field] as string : null;
}

function roleLabel(role: CampusRole | unknown) {
  return String(role ?? "MEMBER").toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function prettify(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "CH";
}

function metric(value: unknown) {
  return typeof value === "number" ? value.toLocaleString() : "0";
}

function moduleTint(module: ModuleKey) {
  return ["Academics", "Coursework"].includes(module) ? "record-blue" : module === "Events" ? "record-peach" : module === "Social" ? "record-lilac" : "record-green";
}
