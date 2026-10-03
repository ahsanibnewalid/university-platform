"use client";

import {
  Bell,
  Bookmark,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  GraduationCap,
  Hash,
  Heart,
  Image as ImageIcon,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type CampusRole = "Student" | "Faculty" | "Parent" | "Administrator";
type Post = {
  id: number;
  name: string;
  role: string;
  initials: string;
  color: string;
  time: string;
  community: string;
  content: string;
  likes: number;
  comments: number;
  liked: boolean;
  image?: string;
  poll?: { question: string; options: string[]; votes: number[] };
};

const stories = [
  { name: "Your story", initials: "+", color: "story-add", own: true },
  { name: "Maya Chen", initials: "MC", color: "avatar-lilac" },
  { name: "Omar Ali", initials: "OA", color: "avatar-sun" },
  { name: "Design Club", initials: "DC", color: "avatar-mint" },
  { name: "Leo Martins", initials: "LM", color: "avatar-peach" },
  { name: "Sara Khan", initials: "SK", color: "avatar-blue" },
  { name: "Robotics Lab", initials: "RL", color: "avatar-lilac" },
];

const initialPosts: Post[] = [
  {
    id: 1,
    name: "Maya Chen",
    role: "Computer Science · Year 3",
    initials: "MC",
    color: "avatar-lilac",
    time: "18 min ago",
    community: "Design & Creativity",
    content:
      "A little peek at what our team has been building for the campus innovation showcase ✨ So proud of how this came together. Come find us at the Student Centre tomorrow!",
    likes: 48,
    comments: 12,
    liked: false,
    image: "creative",
  },
  {
    id: 2,
    name: "Dr. Daniel Okafor",
    role: "Faculty · School of Engineering",
    initials: "DO",
    color: "avatar-green",
    time: "1 hr ago",
    community: "Engineering Students",
    content:
      "Quick pulse check before we lock in the guest lecture for next week. Which topic would you find most useful?",
    likes: 26,
    comments: 8,
    liked: true,
    poll: {
      question: "Choose the next guest lecture topic",
      options: [
        "AI for sustainable cities",
        "Building a career in robotics",
        "From research to real-world impact",
      ],
      votes: [28, 19, 12],
    },
  },
  {
    id: 3,
    name: "Amina Yusuf",
    role: "Environmental Science · Year 2",
    initials: "AY",
    color: "avatar-peach",
    time: "3 hrs ago",
    community: "Campus Green Team",
    content:
      "The community garden is looking so good after this morning's volunteer session 🌱 Huge thanks to everyone who showed up. New volunteers always welcome!",
    likes: 73,
    comments: 16,
    liked: false,
  },
];

const communities = [
  { name: "Design & Creativity", members: "2.4k", color: "community-lilac", icon: "✳" },
  { name: "Engineering Students", members: "1.8k", color: "community-blue", icon: "⌘" },
  { name: "Campus Green Team", members: "946", color: "community-green", icon: "🌱" },
];

const campusEvents = [
  {
    day: "12",
    month: "OCT",
    title: "Campus Innovation Showcase",
    detail: "Student Centre · 10:00 AM",
    color: "event-lilac",
  },
  {
    day: "14",
    month: "OCT",
    title: "Careers & Coffee",
    detail: "The Commons · 2:30 PM",
    color: "event-peach",
  },
];

const roles: CampusRole[] = ["Student", "Faculty", "Parent", "Administrator"];

export default function SocialCampus() {
  const [posts, setPosts] = useState(initialPosts);
  const [activeNav, setActiveNav] = useState("Home");
  const [activeFeed, setActiveFeed] = useState("For you");
  const [role, setRole] = useState<CampusRole>("Student");
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [storyName, setStoryName] = useState<string | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [joinedCommunities, setJoinedCommunities] = useState<string[]>([]);
  const [attendingEvents, setAttendingEvents] = useState<string[]>([]);
  const [votedPolls, setVotedPolls] = useState<number[]>([]);

  const visiblePosts = useMemo(
    () =>
      posts.filter((post) => {
        const matchesSearch =
          !search ||
          `${post.name} ${post.community} ${post.content}`
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesFeed =
          activeFeed !== "Following" ||
          ["Maya Chen", "Amina Yusuf"].includes(post.name);
        return matchesSearch && matchesFeed;
      }),
    [activeFeed, posts, search],
  );

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const content = String(form.get("content") ?? "").trim();
    if (!content) return;

    setPosts((current) => [
      {
        id: Date.now(),
        name: "Alex Morgan",
        role: `${role} · CampusHub`,
        initials: "AM",
        color: "avatar-blue",
        time: "Just now",
        community: String(form.get("community") ?? "Campus community"),
        content,
        likes: 0,
        comments: 0,
        liked: false,
      },
      ...current,
    ]);
    setComposerOpen(false);
    showNotice("Your post is live in this preview.");
  }

  function toggleLike(id: number) {
    setPosts((current) =>
      current.map((post) =>
        post.id === id
          ? {
              ...post,
              liked: !post.liked,
              likes: post.likes + (post.liked ? -1 : 1),
            }
          : post,
      ),
    );
  }

  function toggleItem(
    item: string,
    selected: string[],
    update: (items: string[]) => void,
  ) {
    update(
      selected.includes(item)
        ? selected.filter((value) => value !== item)
        : [...selected, item],
    );
  }

  return (
    <main className="campus-shell">
      <header className="topbar">
        <button
          className="mobile-menu icon-button"
          aria-label="Open navigation"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <a className="brand" href="#" onClick={() => setActiveNav("Home")}>
          <span className="brand-mark">
            <GraduationCap size={22} strokeWidth={2.3} />
          </span>
          <span>campus<span className="brand-accent">hub</span></span>
        </a>
        <label className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people, posts, communities..."
            aria-label="Search campus"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="topbar-actions">
          <button
            className={`icon-button notification-button ${notificationOpen ? "selected" : ""}`}
            aria-label="Notifications"
            onClick={() => setNotificationOpen((open) => !open)}
          >
            <Bell size={19} />
            <span className="notification-dot" />
          </button>
          <div className="profile-menu-wrap">
            <button
              className="top-profile"
              onClick={() => setRoleMenuOpen((open) => !open)}
              aria-expanded={roleMenuOpen}
            >
              <span className="avatar avatar-blue avatar-small">AM</span>
              <span className="profile-name">Alex Morgan</span>
              <ChevronDown size={15} />
            </button>
            {roleMenuOpen && (
              <div className="floating-menu role-menu">
                <div className="menu-heading">Preview as role</div>
                {roles.map((item) => (
                  <button
                    className="menu-option"
                    key={item}
                    onClick={() => {
                      setRole(item);
                      setRoleMenuOpen(false);
                    }}
                  >
                    {item}
                    {role === item && <Check size={15} />}
                  </button>
                ))}
                <p className="menu-footnote">Role switching is a UI preview only.</p>
              </div>
            )}
          </div>
        </div>
      </header>

      {notificationOpen && (
        <aside className="notification-panel">
          <div className="panel-heading">
            <strong>Notifications</strong>
            <button
              className="text-button"
              onClick={() => setNotificationOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="notification-item">
            <span className="notification-icon notification-lilac"><Heart size={16} /></span>
            <p><strong>Maya Chen</strong> and 12 others liked your post.<small>12 minutes ago</small></p>
          </div>
          <div className="notification-item">
            <span className="notification-icon notification-green"><Users size={16} /></span>
            <p><strong>Design & Creativity</strong> shared a new community update.<small>1 hour ago</small></p>
          </div>
        </aside>
      )}

      <div className="app-layout">
        <aside className={`left-sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
          <div className="institution-card">
            <div className="institution-seal"><GraduationCap size={19} /></div>
            <div>
              <strong>Northstar University</strong>
              <span>Official campus</span>
            </div>
            <ChevronDown size={15} />
          </div>

          <nav className="main-navigation" aria-label="Main navigation">
            <NavItem icon={<Sparkles size={19} />} label="Home" active={activeNav === "Home"} onClick={() => setActiveNav("Home")} />
            <NavItem icon={<Compass size={19} />} label="Explore" active={activeNav === "Explore"} onClick={() => { setActiveNav("Explore"); showNotice("Explore is coming soon."); }} />
            <NavItem icon={<Users size={19} />} label="Communities" active={activeNav === "Communities"} onClick={() => { setActiveNav("Communities"); showNotice("Community discovery is coming soon."); }} badge="3" />
            <NavItem icon={<CalendarDays size={19} />} label="Events" active={activeNav === "Events"} onClick={() => { setActiveNav("Events"); showNotice("Event registration preview is on the right."); }} />
            <NavItem icon={<MessageCircle size={19} />} label="Messages" active={activeNav === "Messages"} onClick={() => { setActiveNav("Messages"); showNotice("Messaging is planned as a separate, secure subsystem."); }} />
            <NavItem icon={<BriefcaseBusiness size={19} />} label="Opportunities" active={activeNav === "Opportunities"} onClick={() => { setActiveNav("Opportunities"); showNotice("Career opportunities are coming soon."); }} />
          </nav>

          <div className="sidebar-divider" />
          <div className="sidebar-section-heading">
            <span>Your communities</span>
            <button className="tiny-icon-button" aria-label="Add a community" onClick={() => showNotice("Community creation is coming soon.")}><Plus size={16} /></button>
          </div>
          <div className="community-nav-list">
            {communities.map((community) => (
              <button
                className="community-nav-item"
                key={community.name}
                onClick={() => {
                  setSearch(community.name);
                  setActiveNav("Communities");
                }}
              >
                <span className={`community-icon ${community.color}`}>{community.icon}</span>
                <span>{community.name}</span>
              </button>
            ))}
          </div>

          <div className="sidebar-spacer" />
          <button className="nav-item quiet-nav" onClick={() => showNotice("CampusHub help is coming soon.")}><CircleHelp size={18} />Help & support</button>
          <button className="nav-item quiet-nav" onClick={() => showNotice("Settings are coming soon.")}><Settings size={18} />Settings</button>
          <div className="sidebar-user">
            <span className="avatar avatar-blue">AM</span>
            <span className="sidebar-user-copy"><strong>Alex Morgan</strong><small>{role}</small></span>
            <MoreHorizontal size={19} />
          </div>
        </aside>

        <section className="feed-column">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">SATURDAY, OCTOBER 11</p>
              <h1>Your campus, <span>connected.</span></h1>
              <p className="welcome-copy">Good morning, Alex. Here&apos;s what&apos;s happening around campus.</p>
            </div>
            <button className="primary-button welcome-create" onClick={() => setComposerOpen(true)}><Plus size={17} />Create post</button>
          </div>

          <section className="stories-section" aria-label="Campus stories">
            <div className="section-heading">
              <div><h2>Campus stories</h2><span>Little moments from your community</span></div>
              <button className="text-button" onClick={() => showNotice("You are all caught up on stories.")}>See all <ChevronRight size={14} /></button>
            </div>
            <div className="stories-row">
              {stories.map((story) => (
                <button
                  className="story"
                  key={story.name}
                  onClick={() => story.own ? setComposerOpen(true) : setStoryName(story.name)}
                >
                  <span className={`story-ring ${story.own ? "own-story" : ""}`}>
                    <span className={`avatar story-avatar ${story.color}`}>{story.initials}</span>
                    {story.own && <span className="story-plus"><Plus size={12} /></span>}
                  </span>
                  <span className="story-name">{story.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="composer-card">
            <div className="composer-top">
              <span className="avatar avatar-blue">AM</span>
              <button className="composer-prompt" onClick={() => setComposerOpen(true)}>Share something with your campus...</button>
            </div>
            <div className="composer-actions">
              <button onClick={() => setComposerOpen(true)}><ImageIcon size={17} className="action-green" />Photo</button>
              <button onClick={() => setComposerOpen(true)}><CalendarDays size={17} className="action-orange" />Event</button>
              <button onClick={() => setComposerOpen(true)}><ChartIcon />Poll</button>
              <button className="composer-post-button" onClick={() => setComposerOpen(true)}>Post</button>
            </div>
          </section>

          <div className="feed-tabs">
            <div className="feed-tab-list" role="tablist" aria-label="Feed">
              {["For you", "Following", "University"].map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeFeed === tab}
                  className={`feed-tab ${activeFeed === tab ? "active" : ""}`}
                  onClick={() => setActiveFeed(tab)}
                >
                  {tab}
                  {tab === "For you" && <span className="feed-tab-sparkle"><Sparkles size={12} /></span>}
                </button>
              ))}
            </div>
            <button className="feed-filter" onClick={() => showNotice("Feed preferences are coming soon.")}><Settings size={16} /> <span>Preferences</span></button>
          </div>

          <div className="post-list">
            {visiblePosts.map((post) => (
              <article className="post-card" key={post.id}>
                <div className="post-header">
                  <span className={`avatar ${post.color}`}>{post.initials}</span>
                  <div className="post-author">
                    <strong>{post.name} <ShieldCheck size={14} className="verified-icon" /></strong>
                    <span>{post.role} <span className="post-dot">·</span> {post.time}</span>
                  </div>
                  <button className="more-button" aria-label="More post options" onClick={() => showNotice("Post options are coming soon.")}><MoreHorizontal size={20} /></button>
                </div>
                <button className="post-community" onClick={() => { setSearch(post.community); setActiveNav("Communities"); }}><Hash size={13} />{post.community}</button>
                <p className="post-copy">{post.content}</p>
                {post.image && (
                  <div className="post-image" role="img" aria-label="Creative project displayed at a campus showcase">
                    <div className="art-shape art-circle" />
                    <div className="art-shape art-arch" />
                    <div className="art-shape art-sun" />
                    <span className="art-caption">make room<br />for wonder</span>
                    <span className="art-label">NORTHSTAR<br />STUDENT SHOWCASE</span>
                    <span className="art-stamp">2025<br />✳</span>
                  </div>
                )}
                {post.poll && (
                  <div className="poll-card">
                    <strong>{post.poll.question}</strong>
                    <div className="poll-options">
                      {post.poll.options.map((option, index) => {
                        const total = post.poll!.votes.reduce((sum, votes) => sum + votes, 0);
                        const percentage = Math.round((post.poll!.votes[index] / total) * 100);
                        return (
                          <button
                            className={`poll-option ${votedPolls.includes(post.id) ? "poll-voted" : ""}`}
                            key={option}
                            onClick={() => {
                              if (!votedPolls.includes(post.id)) {
                                setVotedPolls((current) => [...current, post.id]);
                                setPosts((current) => current.map((item) =>
                                  item.id === post.id && item.poll
                                    ? { ...item, poll: { ...item.poll, votes: item.poll.votes.map((votes, voteIndex) => votes + (voteIndex === index ? 1 : 0)) } }
                                    : item,
                                ));
                              }
                            }}
                          >
                            {votedPolls.includes(post.id) && <span className="poll-progress" style={{ width: `${percentage}%` }} />}
                            <span>{option}</span>
                            {votedPolls.includes(post.id) && <small>{percentage}%</small>}
                          </button>
                        );
                      })}
                    </div>
                    <span className="poll-total">{post.poll.votes.reduce((sum, votes) => sum + votes, 0)} votes · 2 days left</span>
                  </div>
                )}
                <div className="post-stats">
                  <span><span className="stats-reaction"><Heart size={11} fill="currentColor" /></span> {post.likes} likes</span>
                  <button onClick={() => showNotice("Comments are a preview in this first slice.")}>{post.comments} comments</button>
                </div>
                <div className="post-actions">
                  <button className={post.liked ? "is-liked" : ""} onClick={() => toggleLike(post.id)}><Heart size={17} fill={post.liked ? "currentColor" : "none"} />Like</button>
                  <button onClick={() => showNotice("Comments are a preview in this first slice.")}><MessageCircle size={17} />Comment</button>
                  <button onClick={() => showNotice("Sharing is coming soon.")}><Share2 size={17} />Share</button>
                  <button className="save-post" aria-label="Save post" onClick={() => showNotice("Post saved in this preview.")}><Bookmark size={17} /></button>
                </div>
              </article>
            ))}
            {visiblePosts.length === 0 && (
              <div className="empty-state">
                <Search size={22} />
                <strong>No posts found</strong>
                <span>Try another search or switch your feed.</span>
                <button className="text-button" onClick={() => setSearch("")}>Clear search</button>
              </div>
            )}
          </div>
          <p className="preview-note">You&apos;re viewing a CampusHub preview. Posts and profile changes are not saved yet.</p>
        </section>

        <aside className="right-sidebar">
          <section className="right-card campus-pulse-card">
            <div className="card-title-row"><div><h2>Campus pulse</h2><span>A little good news</span></div><span className="pulse-icon"><Sparkles size={17} /></span></div>
            <div className="pulse-number">2,481 <span>👋</span></div>
            <p>people are around campus today</p>
            <div className="pulse-avatars">
              {["MC", "OA", "SK", "AY", "DO"].map((person, index) => <span key={person} className={`avatar avatar-tiny ${["avatar-lilac", "avatar-sun", "avatar-blue", "avatar-peach", "avatar-green"][index]}`}>{person}</span>)}
              <span className="pulse-more">+2.4k</span>
            </div>
          </section>

          <section className="right-card events-card">
            <div className="card-title-row"><div><h2>Coming up</h2><span>Good things on campus</span></div><button className="text-button" onClick={() => { setActiveNav("Events"); showNotice("All campus events are coming soon."); }}>See all</button></div>
            <div className="event-list">
              {campusEvents.map((event) => (
                <div className="event-item" key={event.title}>
                  <div className={`event-date ${event.color}`}><strong>{event.day}</strong><span>{event.month}</span></div>
                  <div className="event-detail"><strong>{event.title}</strong><span>{event.detail}</span><button className={`event-rsvp ${attendingEvents.includes(event.title) ? "rsvp-active" : ""}`} onClick={() => toggleItem(event.title, attendingEvents, setAttendingEvents)}>{attendingEvents.includes(event.title) ? <><Check size={13} />Going</> : "I’m interested"}</button></div>
                </div>
              ))}
            </div>
          </section>

          <section className="right-card communities-card">
            <div className="card-title-row"><div><h2>Find your people</h2><span>Communities you might love</span></div><Compass size={17} className="muted-icon" /></div>
            <div className="suggested-list">
              {communities.map((community) => (
                <div className="suggested-community" key={community.name}>
                  <span className={`community-icon suggested-icon ${community.color}`}>{community.icon}</span>
                  <span className="suggested-copy"><strong>{community.name}</strong><small>{community.members} members</small></span>
                  <button
                    className={`join-button ${joinedCommunities.includes(community.name) ? "joined" : ""}`}
                    aria-label={`${joinedCommunities.includes(community.name) ? "Leave" : "Join"} ${community.name}`}
                    onClick={() => toggleItem(community.name, joinedCommunities, setJoinedCommunities)}
                  >
                    {joinedCommunities.includes(community.name) ? <Check size={15} /> : <Plus size={15} />}
                  </button>
                </div>
              ))}
            </div>
            <button className="discover-link" onClick={() => { setActiveNav("Explore"); showNotice("Community discovery is coming soon."); }}>Discover all communities <ChevronRight size={14} /></button>
          </section>

          <section className="right-card campus-tip">
            <span className="tip-icon"><Sparkles size={16} /></span>
            <div><strong>A little campus tip</strong><p>Make your profile yours — add your interests to find the right people and communities.</p><button onClick={() => showNotice("Profile editing is coming soon.")}>Edit your profile <ChevronRight size={13} /></button></div>
          </section>

          <footer className="footer-links">
            <a href="#" onClick={(event) => event.preventDefault()}>About</a><a href="#" onClick={(event) => event.preventDefault()}>Guidelines</a><a href="#" onClick={(event) => event.preventDefault()}>Privacy</a><a href="#" onClick={(event) => event.preventDefault()}>Help</a>
            <span>© 2025 CampusHub · A better campus, together.</span>
          </footer>
        </aside>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {[
          { label: "Home", icon: <Sparkles size={20} /> },
          { label: "Explore", icon: <Compass size={20} /> },
          { label: "Communities", icon: <Users size={20} /> },
          { label: "Messages", icon: <MessageCircle size={20} /> },
          { label: "Profile", icon: <span className="avatar avatar-tiny avatar-blue">AM</span> },
        ].map((item) => (
          <button className={activeNav === item.label ? "mobile-active" : ""} key={item.label} onClick={() => { setActiveNav(item.label); if (item.label !== "Home") showNotice(`${item.label} is coming soon.`); }}>
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
      </nav>

      {composerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposerOpen(false); }}>
          <section className="composer-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title">
            <div className="modal-heading"><h2 id="composer-title">Share with your campus</h2><button className="icon-button" aria-label="Close composer" onClick={() => setComposerOpen(false)}><X size={19} /></button></div>
            <div className="modal-author"><span className="avatar avatar-blue">AM</span><div><strong>Alex Morgan</strong><small>{role} · Northstar University</small></div></div>
            <form onSubmit={createPost}>
              <textarea name="content" placeholder="What’s happening on campus?" autoFocus maxLength={1200} required />
              <label className="community-select-label" htmlFor="community-select">Share with</label>
              <select id="community-select" name="community" defaultValue="Campus community">
                <option>Campus community</option>
                {communities.map((community) => <option key={community.name}>{community.name}</option>)}
              </select>
              <div className="modal-actions"><span><ImageIcon size={17} /> Photo or video</span><button className="primary-button" type="submit"><Send size={15} />Share post</button></div>
            </form>
          </section>
        </div>
      )}

      {storyName && (
        <div className="modal-backdrop story-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setStoryName(null); }}>
          <section className="story-viewer" role="dialog" aria-modal="true" aria-label={`${storyName}'s story`}>
            <div className="story-progress"><span /></div>
            <div className="story-viewer-head"><strong>{storyName}</strong><button className="icon-button" aria-label="Close story" onClick={() => setStoryName(null)}><X size={20} /></button></div>
            <div className="story-viewer-content"><Sparkles size={35} /><strong>A little campus moment</strong><span>Stories are a preview in this first slice.</span></div>
          </section>
        </div>
      )}
      {notice && <div className="toast-message" role="status">{notice}</div>}
    </main>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button className={`nav-item ${active ? "nav-active" : ""}`} onClick={onClick}>
      {icon}<span>{label}</span>{badge && <span className="nav-badge">{badge}</span>}
    </button>
  );
}

function ChartIcon() {
  return (
    <span className="chart-icon"><span /><span /><span /></span>
  );
}
