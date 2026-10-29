import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable,
  RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

type RecordValue = Record<string, unknown>;
type Session = {
  user: { id: string; name: string; email?: string };
  institution: { id: string; name: string };
  membershipId?: string;
  role: string;
};
type Tab = "Overview" | "Notices" | "Courses" | "Payments" | "Requests" | "Account";
const tabs: Tab[] = ["Overview", "Notices", "Courses", "Payments", "Requests", "Account"];
const tokenKey = "campushub.mobile.session.v1";
const configuredUrl = Constants.expoConfig?.extra?.portalUrl;
const portalOrigin = (() => {
  try {
    const parsed = new URL(typeof configuredUrl === "string" ? configuredUrl : "");
    if (parsed.protocol !== "https:" || parsed.hostname === "example.edu" || parsed.username || parsed.password) return "";
    return parsed.origin;
  } catch { return ""; }
})();
const studentRoles = ["STUDENT", "MEDICAL_STUDENT", "LAW_STUDENT"];
const financeRoles = ["SUPER_ADMIN", "PRINCIPAL", "UNIVERSITY_ADMIN", "REGISTRAR", "FINANCE_ADMIN", "ACCOUNTANT"];
const reviewerRoles = ["SUPER_ADMIN", "PRINCIPAL", "UNIVERSITY_ADMIN", "REGISTRAR", "TEACHER", "FACULTY"];

function object(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function rows(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.filter((item) => !!item && typeof item === "object" && !Array.isArray(item)) as RecordValue[] : [];
}
function label(value: unknown, fallback = "—"): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}
function dateLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const valueDate = new Date(value);
  return Number.isFinite(valueDate.getTime()) ? valueDate.toLocaleDateString("en-BD") : value;
}
function money(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? `৳ ${number.toLocaleString("en-BD")}` : "৳ —";
}
async function request<T extends RecordValue = RecordValue>(
  path: string, token?: string, init?: RequestInit,
): Promise<T> {
  if (!portalOrigin) throw new Error("Configure your approved HTTPS portal URL first.");
  const response = await fetch(`${portalOrigin}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-store",
      ...(init?.body ? { "Content-Type": "application/json", Origin: portalOrigin } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = object(body).error;
    throw new Error(typeof message === "string" ? message : `Request failed (${response.status}).`);
  }
  return object(body) as T;
}

function ActionButton({ title, onPress, quiet = false, disabled = false }: {
  title: string; onPress: () => void; quiet?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[styles.button, quiet && styles.secondaryButton, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, quiet && styles.secondaryButtonText]}>{title}</Text>
  </Pressable>;
}
function Field({ labelText, value, onChangeText, secure = false, keyboardType = "default", multiline = false, hint }: {
  labelText: string; value: string; onChangeText: (next: string) => void;
  secure?: boolean; keyboardType?: "default" | "email-address"; multiline?: boolean; hint?: string;
}) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{labelText}</Text>
    <TextInput style={[styles.input, multiline && styles.multiInput]} value={value} onChangeText={onChangeText}
      secureTextEntry={secure} keyboardType={keyboardType} autoCapitalize="none" autoCorrect={false}
      multiline={multiline} placeholder={hint} placeholderTextColor="#8191a8" />
  </View>;
}
function Card({ title, detail, children }: { title: string; detail?: string; children?: React.ReactNode }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>
    {detail ? <Text style={styles.detail}>{detail}</Text> : null}{children}</View>;
}
function Choice({ title, value, choices, onChoose }: {
  title: string; value: string; choices: { value: string; label: string }[]; onChoose: (value: string) => void;
}) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{title}</Text>
    {choices.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {choices.map((option) => <Pressable key={option.value} onPress={() => onChoose(option.value)}
        style={[styles.choice, value === option.value && styles.choiceSelected]}>
        <Text style={[styles.choiceText, value === option.value && styles.choiceTextSelected]}>{option.label}</Text>
      </Pressable>)}
    </ScrollView> : <Text style={styles.detail}>No eligible options available.</Text>}
  </View>;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<RecordValue>({});
  const [refreshing, setRefreshing] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [studentId, setStudentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("14:00");

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const saved = await SecureStore.getItemAsync(tokenKey);
        if (saved) {
          const result = await request<RecordValue>("/api/auth/session", saved);
          if (!live) return;
          if (result.user) {
            setToken(saved);
            setSession(result as unknown as Session);
          } else {
            await SecureStore.deleteItemAsync(tokenKey);
          }
        }
      } catch (failure) {
        if (live) setError(failure instanceof Error ? failure.message : "Could not restore your session.");
      } finally { if (live) setStarting(false); }
    })();
    return () => { live = false; };
  }, []);

  const load = useCallback(async (activeTab: Tab, accessToken: string, role: string) => {
    let payload: RecordValue = {};
    if (activeTab === "Overview") {
      payload = await request("/api/dashboard", accessToken);
    } else if (activeTab === "Notices") {
      const [announcements, notifications] = await Promise.all([
        request("/api/announcements", accessToken), request("/api/notifications", accessToken),
      ]);
      payload = { ...announcements, ...notifications };
    } else if (activeTab === "Courses") {
      const courses = await request("/api/courses", accessToken);
      const exams = studentRoles.includes(role) || role === "PARENT" || reviewerRoles.includes(role) || role === "EXAM_CONTROLLER"
        ? await request("/api/exams", accessToken) : {};
      payload = { ...courses, ...exams };
    } else if (activeTab === "Payments") {
      payload = studentRoles.includes(role) || role === "PARENT" || financeRoles.includes(role)
        ? await request("/api/finance/invoices", accessToken) : { unavailable: true };
    } else if (activeTab === "Requests") {
      const leaveAccess = studentRoles.includes(role) || role === "PARENT" || reviewerRoles.includes(role);
      const appointmentAccess = role === "PARENT" || reviewerRoles.includes(role);
      const [leaves, appointments] = await Promise.all([
        leaveAccess ? request("/api/leave-requests", accessToken) : Promise.resolve({}),
        appointmentAccess ? request("/api/appointments", accessToken) : Promise.resolve({}),
      ]);
      payload = { ...leaves, ...appointments };
    } else {
      payload = await request("/api/auth/memberships", accessToken);
    }
    setData(payload);
  }, []);

  useEffect(() => {
    if (!token || !session) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setRefreshing(true);
      setError("");
      try { await load(tab, token, session.role); }
      catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Could not load campus data."); }
      finally { if (active) setRefreshing(false); }
    });
    return () => { active = false; };
  }, [token, session, tab, load]);

  const reload = async () => {
    if (!token || !session) return;
    setRefreshing(true);
    try { await load(tab, token, session.role); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to refresh."); }
    finally { setRefreshing(false); }
  };
  const mutate = async (path: string, method: "POST" | "PATCH" | "PUT", body: RecordValue) => {
    if (!token) return;
    setBusy(true);
    try {
      await request(path, token, { method, body: JSON.stringify(body) });
      await reload();
      Alert.alert("Saved", "Your request was processed.");
    } catch (failure) {
      Alert.alert("Unable to complete", failure instanceof Error ? failure.message : "Please try again.");
    } finally { setBusy(false); }
  };
  const login = async () => {
    if (!identifier.trim() || !password) return;
    setBusy(true); setError("");
    try {
      const result = await request<RecordValue>("/api/mobile/auth/login", undefined, {
        method: "POST", body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const nextToken = result.token;
      if (typeof nextToken !== "string") throw new Error("The server did not return a session token.");
      await SecureStore.setItemAsync(tokenKey, nextToken);
      setToken(nextToken);
      setSession({ user: result.user as Session["user"], institution: result.institution as Session["institution"], role: String(result.role) });
      setPassword("");
      setTab("Overview");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Sign-in failed."); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    if (token) {
      try { await request("/api/mobile/auth/logout", token, { method: "POST", body: "{}" }); }
      catch { /* The locally stored token is removed even when the device is offline. */ }
    }
    await SecureStore.deleteItemAsync(tokenKey);
    setToken(null); setSession(null); setData({}); setError(""); setTab("Overview");
  };
  const switchRole = async (membershipId: string) => {
    if (!token) return;
    setBusy(true);
    try {
      await request("/api/auth/session", token, { method: "PUT", body: JSON.stringify({ membershipId }) });
      const result = await request<RecordValue>("/api/auth/session", token);
      if (!result.user) throw new Error("Your session expired.");
      setSession(result as unknown as Session);
      setTab("Overview");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not switch role."); }
    finally { setBusy(false); }
  };

  if (!portalOrigin) {
    return <SafeAreaView style={styles.center}><Text style={styles.heading}>CampusHub setup</Text>
      <Text style={styles.detail}>Set expo.extra.portalUrl in app.json to your trusted, deployed HTTPS college portal before signing in.</Text></SafeAreaView>;
  }
  if (starting) return <SafeAreaView style={styles.center}><ActivityIndicator size="large" color="#1758b7"/><Text style={styles.detail}>Restoring your secure campus session…</Text></SafeAreaView>;
  if (!session || !token) return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content"/>
    <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.loginBox}>
        <Text style={styles.brand}>Siddheswari College</Text><Text style={styles.heading}>Welcome to CampusHub</Text>
        <Text style={styles.detail}>Secure Android and iOS access for students, guardians, teachers and campus staff.</Text>
        <Field labelText="Student ID or approved staff Gmail" value={identifier} onChangeText={setIdentifier} hint="College student ID / name@gmail.com"/>
        <Field labelText="Password" value={password} onChangeText={setPassword} secure hint="Your college account password"/>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ActionButton title={busy ? "Signing in…" : "Sign in"} disabled={busy} onPress={() => void login()}/>
        <Text style={styles.detail}>Use the existing college portal account. Passwords are never stored on this device.</Text>
      </View>
    </KeyboardAvoidingView></SafeAreaView>;

  const role = session.role;
  const isStudent = studentRoles.includes(role);
  const isParent = role === "PARENT";
  const canReview = reviewerRoles.includes(role);
  const requests = rows(data.requests);
  const appointments = rows(data.appointments);
  const children = rows(data.children);
  const teachers = rows(data.teachers).filter((teacher) => !studentId || teacher.studentId === studentId);
  const canRequestLeave = isStudent || isParent;

  return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content"/>
    <View style={styles.header}><View><Text style={styles.brand}>CampusHub</Text>
      <Text style={styles.headerSubtitle}>{session.institution.name} · {role.replaceAll("_", " ")}</Text></View>
      {busy ? <ActivityIndicator color="#fff"/> : <Pressable onPress={() => void reload()} accessibilityLabel="Refresh campus data"><Text style={styles.headerLink}>Refresh</Text></Pressable>}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
      {tabs.map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.activeTab]}>
        <Text style={[styles.tabText, tab === item && styles.activeTabText]}>{item}</Text>
      </Pressable>)}
    </ScrollView>
    <ScrollView style={styles.content} contentContainerStyle={styles.contentBody}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()}/>}>
      <Text style={styles.heading}>{tab}</Text><Text style={styles.detail}>Hello, {session.user.name}. Your campus information is scoped to your active role.</Text>
      {error ? <Card title="Connection or access problem"><Text style={styles.error}>{error}</Text><ActionButton title="Try again" quiet onPress={() => void reload()}/></Card> : null}

      {tab === "Overview" && <>
        {object(data.metrics) && Object.keys(object(data.metrics)).length > 0 && <Card title="Campus overview">
          {Object.entries(object(data.metrics)).map(([key, value]) => <Text style={styles.rowText} key={key}>{key.replaceAll(/([A-Z])/g, " $1")}: {label(value, "0")}</Text>)}
        </Card>}
        {isStudent && <Card title="Academic progress"><Text style={styles.rowText}>GPA: {label(data.gpa)}</Text><Text style={styles.rowText}>Attendance: {label(data.attendanceRate)}%</Text><Text style={styles.rowText}>Unread notifications: {label(data.unreadNotifications, "0")}</Text></Card>}
        {isParent && rows(data.children).map((link) => <Card key={label(link.id)} title={label(link.name)} detail={`Attendance: ${label(link.attendanceRate)}% · ${rows(link.results).length} released results`}/>)}
        {rows(data.courses).map((course) => <Card key={label(course.id)} title={label(object(object(course.section).course).title, "Course")} detail={label(object(course.section).sectionCode)}/>)}
        {rows(data.sections).map((section) => <Card key={label(section.id)} title={label(object(section.course).title, "Teaching section")} detail={`${label(object(section.course).code)} · ${label(object(section._count).enrollments, "0")} students`}/>)}
        <ActionButton title="View official website" quiet onPress={() => void Linking.openURL(portalOrigin)}/>
      </>}

      {tab === "Notices" && <>
        {rows(data.announcements).map((item) => <Card key={label(item.id)} title={label(item.title)} detail={`${dateLabel(item.publishedAt)} · ${label(object(item.author).name)}`}><Text style={styles.bodyText}>{label(item.body, "")}</Text></Card>)}
        {!rows(data.announcements).length && <Card title="No announcements" detail="Published official notices will appear here."/>}
        <Text style={styles.sectionTitle}>Your notifications</Text>
        {rows(data.notifications).map((notice) => <Card key={label(notice.id)} title={label(notice.title)} detail={dateLabel(notice.createdAt)}>
          <Text style={styles.bodyText}>{label(notice.body, "")}</Text>
          {!notice.readAt && <ActionButton title="Mark as read" quiet disabled={busy} onPress={() => void mutate("/api/notifications", "PATCH", { notificationId: notice.id })}/>}
        </Card>)}
      </>}

      {tab === "Courses" && <>
        {rows(data.courses).map((section) => <Card key={label(section.id)} title={label(object(section.course).title, "Course")}
          detail={`${label(object(section.course).code)} · ${label(object(section.term).name)} · Section ${label(section.sectionCode)}`}/>)}
        {!rows(data.courses).length && <Card title="No enrolled or assigned courses" detail="Courses will appear when registered or assigned."/>}
        <Text style={styles.sectionTitle}>Examinations</Text>
        {rows(data.exams).map((exam) => <Card key={label(exam.id)} title={label(exam.title)} detail={`Scheduled: ${dateLabel(exam.startsAt)}`}>
          {rows(exam.results).map((result) => <Text key={label(result.studentId)} style={styles.bodyText}>
            {label(result.releasedAt) === "—" ? `Grade: ${label(result.moderationStatus, "Draft")}` : `Published grade: ${label(result.points)} / ${label(exam.maxPoints)}`}
          </Text>)}
        </Card>)}
      </>}

      {tab === "Payments" && <>
        {data.unavailable && <Card title="Not available" detail="Your active role cannot view student finance records."/>}
        {rows(data.invoices).map((invoice) => <Card key={label(invoice.id)} title={label(invoice.invoiceNumber)}
          detail={`Due: ${dateLabel(invoice.dueAt)} · ${label(invoice.status)}`}>
          <Text style={styles.rowText}>Total: {money(invoice.totalAmount)}</Text>
          <Text style={styles.rowText}>Paid: {money(invoice.paidAmount)}</Text>
        </Card>)}
        {rows(data.payments).map((payment) => <Card key={label(payment.id)} title={`Payment ${label(payment.transactionId, label(payment.id))}`}
          detail={`${label(payment.status)} · ${dateLabel(payment.paidAt)}`}>
          <Text style={styles.rowText}>{money(payment.amount)} BDT</Text>
        </Card>)}
        {!data.unavailable && !rows(data.invoices).length && <Card title="No invoices" detail="Verified fees and payments will appear here."/>}
        <ActionButton title="Open full payment portal" quiet onPress={() => void Linking.openURL(`${portalOrigin}/dashboard?module=Fees`)}/>
      </>}

      {tab === "Requests" && <>
        {canRequestLeave && <Card title="Request student leave" detail="Dates must use YYYY-MM-DD. Requests are reviewed by assigned staff.">
          {isParent && <Choice title="Student" value={studentId} onChoose={setStudentId} choices={children.map((child) => ({ value: label(child.id), label: label(child.name) }))}/>}
          <Field labelText="Start date (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} hint="2026-11-01"/>
          <Field labelText="End date (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} hint="2026-11-02"/>
          <Field labelText="Reason" value={reason} onChangeText={setReason} multiline hint="Explain the leave request (10+ characters)"/>
          <ActionButton title="Submit leave request" disabled={busy || !startDate || !endDate || reason.trim().length < 10 || (isParent && !studentId)}
            onPress={() => void mutate("/api/leave-requests", "POST", { startDate, endDate, reason, ...(isParent ? { studentId } : {}) })}/>
        </Card>}
        {isParent && <Card title="Request teacher meeting" detail="Choose your verified child and their assigned teacher. Meetings must be 24 hours to 90 days ahead.">
          <Choice title="Student" value={studentId} onChoose={(value) => { setStudentId(value); setTeacherId(""); }} choices={children.map((child) => ({ value: label(child.id), label: label(child.name) }))}/>
          <Choice title="Teacher" value={teacherId} onChoose={setTeacherId} choices={teachers.map((teacher) => ({ value: label(teacher.teacherId), label: label(teacher.name) }))}/>
          <Field labelText="Meeting date (YYYY-MM-DD)" value={appointmentDate} onChangeText={setAppointmentDate} hint="2026-11-15"/>
          <Field labelText="Meeting time (HH:MM, 24-hour)" value={appointmentTime} onChangeText={setAppointmentTime}/>
          <Field labelText="Meeting reason" value={reason} onChangeText={setReason} multiline/>
          <ActionButton title="Request appointment" disabled={busy || !studentId || !teacherId || !appointmentDate || reason.trim().length < 10}
            onPress={() => {
              const time = new Date(`${appointmentDate}T${appointmentTime}:00+06:00`);
              if (!Number.isFinite(time.getTime())) return Alert.alert("Invalid date", "Enter a valid meeting date and time.");
              void mutate("/api/appointments", "POST", { studentId, teacherId, note: reason, requestedAt: time.toISOString() });
            }}/>
        </Card>}
        <Text style={styles.sectionTitle}>Student leave requests</Text>
        {requests.map((leave) => <Card key={label(leave.id)} title={`${label(object(leave.student).name)} · ${label(leave.status)}`}
          detail={`${dateLabel(leave.startDate)} – ${dateLabel(leave.endDate)}`}>
          <Text style={styles.bodyText}>{label(leave.reason)}</Text>
          {canReview && leave.status === "PENDING" && <View style={styles.buttonRow}>
            <ActionButton title="Approve" disabled={busy} onPress={() => void mutate("/api/leave-requests", "PATCH", { id: leave.id, status: "APPROVED" })}/>
            <ActionButton title="Reject" quiet disabled={busy} onPress={() => void mutate("/api/leave-requests", "PATCH", { id: leave.id, status: "REJECTED" })}/>
          </View>}
        </Card>)}
        <Text style={styles.sectionTitle}>Parent–teacher appointments</Text>
        {appointments.map((appointment) => <Card key={label(appointment.id)} title={`${label(object(appointment.student).name)} · ${label(appointment.status)}`}
          detail={`${label(object(appointment.teacher).name)} · ${dateLabel(appointment.requestedAt)}`}>
          <Text style={styles.bodyText}>{label(appointment.note)}</Text>
          {appointment.status === "PENDING" && (isParent || role === "TEACHER" || role === "FACULTY") && <View style={styles.buttonRow}>
            {!isParent && <ActionButton title="Confirm" disabled={busy} onPress={() => void mutate("/api/appointments", "PATCH", { id: appointment.id, status: "CONFIRMED" })}/>}
            <ActionButton title={isParent ? "Cancel" : "Decline"} quiet disabled={busy}
              onPress={() => void mutate("/api/appointments", "PATCH", { id: appointment.id, status: isParent ? "CANCELLED" : "DECLINED" })}/>
          </View>}
        </Card>)}
        {!requests.length && !appointments.length && !canRequestLeave && <Card title="No available requests" detail="Your role has no current requests to review."/>}
      </>}

      {tab === "Account" && <>
        <Card title={session.user.name} detail={`${session.institution.name} · ${role.replaceAll("_", " ")}`}>
          <Text style={styles.bodyText}>{session.user.email ?? ""}</Text>
        </Card>
        <Card title="Active campus memberships" detail="Switch roles only when they are assigned to your account.">
          {rows(data.memberships).map((membership) => <ActionButton key={label(membership.id)}
            title={`${label(membership.role).replaceAll("_", " ")} · ${label(object(membership.institution).name)}`}
            disabled={busy || membership.id === session.membershipId} quiet
            onPress={() => void switchRole(label(membership.id))}/>)}
        </Card>
        <ActionButton title="Open college website" quiet onPress={() => void Linking.openURL(portalOrigin)}/>
        <ActionButton title="Sign out from this device" onPress={() => void logout()}/>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f7fc" },
  center: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f4f7fc" },
  loginBox: { backgroundColor: "#fff", borderRadius: 22, padding: 24, gap: 12 },
  header: { padding: 18, backgroundColor: "#122e61", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontWeight: "800", fontSize: 20, color: "#1e60ba" },
  headerSubtitle: { marginTop: 3, color: "#c7daf7", fontSize: 11 },
  headerLink: { color: "#fff", fontWeight: "700", padding: 8 },
  tabBar: { flexGrow: 0, borderBottomColor: "#dbe5f3", borderBottomWidth: 1, backgroundColor: "#fff" },
  tabBarContent: { paddingHorizontal: 10, paddingVertical: 10, gap: 6, alignItems: "center" },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  activeTab: { backgroundColor: "#1758b7" },
  tabText: { color: "#47617e", fontWeight: "600", fontSize: 13 },
  activeTabText: { color: "#fff" },
  content: { flex: 1 },
  contentBody: { padding: 18, paddingBottom: 64, gap: 13 },
  heading: { fontSize: 27, fontWeight: "800", color: "#152e54" },
  detail: { fontSize: 13, lineHeight: 21, color: "#58708d", marginTop: 6 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, gap: 9, borderWidth: 1, borderColor: "#e0e8f2" },
  cardTitle: { fontSize: 17, fontWeight: "700", color: "#1b3659" },
  bodyText: { color: "#304d6e", fontSize: 14, lineHeight: 21 },
  rowText: { color: "#304d6e", fontWeight: "600", fontSize: 14 },
  sectionTitle: { fontSize: 19, fontWeight: "700", marginTop: 14, color: "#193657" },
  field: { gap: 6, marginTop: 6 },
  fieldLabel: { color: "#304765", fontWeight: "700", fontSize: 12 },
  input: { borderWidth: 1, borderColor: "#cdd9e8", borderRadius: 11, backgroundColor: "#fff", color: "#172f4b", padding: 13, fontSize: 15 },
  multiInput: { minHeight: 90, textAlignVertical: "top" },
  button: { backgroundColor: "#1758b7", borderRadius: 11, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  secondaryButton: { backgroundColor: "#eaf1fd" },
  secondaryButtonText: { color: "#174c91" },
  disabled: { opacity: 0.5 },
  error: { color: "#b4233f", fontSize: 13, lineHeight: 20 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { backgroundColor: "#edf2f9", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginRight: 7 },
  choiceSelected: { backgroundColor: "#1758b7" },
  choiceText: { fontSize: 13, color: "#29486b", fontWeight: "600" },
  choiceTextSelected: { color: "#fff" },
});
