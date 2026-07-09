---
layout: post
title: "Why Did My Already-Loaded Component Show a Skeleton Again? React Suspense Bubbling Explained"
date: 2026-05-24
author: Samrat Dutta Roy
tags: [react, suspense, dynamic import, next.js, suspense bubbling, lazy loading, skeleton loader, react internals, frontend debugging, javascript, react performance]
description: "I assumed once a React component loads, it stays loaded and you never see its skeleton again. A bug involving a modal and a misplaced Suspense boundary proved me wrong — and taught me how dynamic imports actually work under the hood."
image: /assets/images/react-suspense-bubbling.png
---

> **Direct answer:** In React, when a dynamically imported component suspends, it throws a Promise up the component tree until the nearest Suspense boundary catches it. If a nested modal has no local Suspense boundary, its suspension can bubble up and trigger a loading skeleton for an entirely unrelated parent component — even one that was already fully loaded. The fix is ensuring every dynamic import has its own local Suspense boundary via a `loading` option.

I was working on a feature that involved opening a modal deep inside a page. The modal was dynamically imported — standard practice for keeping the initial bundle small. Everything looked fine until I noticed something that made no sense:

Opening the modal was making a completely separate part of the page — one that had already loaded — flash back to its skeleton loader.

My mental model at the time was simple: **once a component loads, it stays loaded.** You see the skeleton once, the component appears, and that's it. The skeleton is gone forever.

That assumption was wrong. And understanding *why* it was wrong taught me more about how React works under the hood than almost anything else I've encountered.

---

## What Dynamic Imports Actually Do Under the Hood

To understand the bug, you need to understand what `dynamic()` in Next.js — or `React.lazy()` in plain React — actually does at runtime.

When you write:

```javascript
const PreApproveModal = dynamic(() => import('./PreApproveModal'), {
  loading: () => null,
});
```

React doesn't just "load the component lazily." It does something very specific: **it throws a Promise.**

When your code tries to render `<PreApproveModal />` and the JavaScript chunk for that component hasn't been downloaded yet, React throws a Promise as an exception up the component tree. This is not a metaphor — it literally uses JavaScript's `throw` mechanism.

React then walks up the component tree looking for the nearest `<Suspense>` boundary. When it finds one, it renders that boundary's `fallback` prop while it waits for the Promise to resolve — meaning while the chunk downloads. Once the chunk is ready, React re-renders the component normally.

The `{ loading: () => null }` option in `dynamic()` is shorthand for Next.js automatically wrapping that component in a `<Suspense fallback={loading()}>` boundary. It's a local catch for the thrown Promise — right at the source.

---

## The Bug: What Was Actually Happening

Here's a simplified version of the component tree I was working with:

```jsx
// RecipientsContent — loaded dynamically with a skeleton
const RecipientsContent = dynamic(() => import('./RecipientsContent'), {
  loading: () => <StepContentSkeleton />,
});

// PreApproveModal — loaded dynamically, loading option commented out
const PreApproveModal = dynamic(() => import('./PreApproveModal'), {
  // loading: () => null   <-- this was commented out
});

function Page() {
  return (
    <RecipientsContent>
      <PreApproveModal isOpen={isOpen} />
    </RecipientsContent>
  );
}
```

The chain of events when I opened the modal:

1. `<PreApproveModal />` tries to render for the first time
2. Its JavaScript chunk hasn't downloaded yet — React throws a Promise
3. React walks up the tree looking for the nearest `<Suspense>` boundary to catch it
4. There's no local boundary around `PreApproveModal` — the `loading` option was commented out
5. The Promise keeps bubbling up the tree
6. It hits the `<Suspense>` boundary created by `RecipientsContent`'s `{ loading: () => <StepContentSkeleton /> }`
7. React hides the entire `RecipientsContent` tree and shows `<StepContentSkeleton />` while the modal chunk downloads

The result: opening a small modal caused the entire parent section — already fully rendered, already fully loaded — to disappear and show its skeleton again.

---

## Why My Mental Model Was Wrong

My assumption was: *once a component loads, it stays loaded. The skeleton only appears once.*

This is true for the component that's already loaded. `RecipientsContent` itself was not re-downloading. Its chunk was already in the browser.

But Suspense doesn't work at the chunk level. It works at the **render level**. When a Promise is thrown anywhere inside a Suspense boundary's subtree — from any child, at any depth — React unmounts the entire subtree and shows the fallback. It doesn't matter that most of that subtree was already loaded and rendered. The entire boundary resets.

The key insight: **Suspense boundaries don't protect against re-showing their fallback. They catch any suspension from any descendant, at any time, regardless of whether those descendants were previously loaded.**

Once I understood that, the bug made complete sense.

---

## Why It Stopped When I Changed Things

**Uncommenting `{ loading: () => null }` on the modal:**

```javascript
const PreApproveModal = dynamic(() => import('./PreApproveModal'), {
  loading: () => null, // ← this creates a local Suspense boundary
});
```

Now when `PreApproveModal` throws its Promise, there's a local `<Suspense fallback={null}>` boundary right around it to catch it. The Promise never bubbles up. `RecipientsContent` never sees it. The skeleton never appears. The modal renders `null` briefly while its chunk downloads, then appears — and the rest of the page stays perfectly intact.

**Removing `{ loading: () => <StepContentSkeleton /> }` from `RecipientsContent`:**

Without a boundary on `RecipientsContent`, the bubbling Promise skips past it entirely and travels up to the next boundary — the page level or wherever the next `<Suspense>` lives. You stop seeing `StepContentSkeleton` because that specific boundary no longer exists to catch it. But the suspension is still happening — it's just caught higher up.

---

## The Fix and the Principle Behind It

The fix is straightforward:

```javascript
// Always give deeply nested dynamic imports their own boundary
const PreApproveModal = dynamic(() => import('./PreApproveModal'), {
  loading: () => null, // renders nothing while loading — modal isn't visible yet anyway
});

const HeavyTooltip = dynamic(() => import('./HeavyTooltip'), {
  loading: () => null,
});

const SidePanel = dynamic(() => import('./SidePanel'), {
  loading: () => <SidePanelSkeleton />,
});
```

The principle: **every dynamically imported component should own its Suspense boundary.** Not just the top-level ones. Especially the small, deeply nested ones — modals, tooltips, drawers — because those are the ones most likely to be opened after the page has already rendered, and their suspension has the furthest to bubble before it hits something.

For components where no visible loading state makes sense — a modal that isn't visible until it opens — `loading: () => null` is the right choice. It creates the boundary, catches the suspension locally, renders nothing while loading, and lets everything else on the page continue undisturbed.

---

## Visualising the Suspense Tree

Here's how the component tree looks before and after the fix:

**Before (broken):**

```text
<Page>
  <Suspense fallback={<StepContentSkeleton />}>   ← RecipientsContent's boundary
    <RecipientsContent>                            ← already loaded ✓
      <PreApproveModal />                          ← throws Promise 💥
        (no local boundary — Promise bubbles up)
    </RecipientsContent>
  </Suspense>                                      ← catches it here
                                                   → hides ALL of RecipientsContent
                                                   → shows StepContentSkeleton ❌
```

**After (fixed):**

```text
<Page>
  <Suspense fallback={<StepContentSkeleton />}>   ← RecipientsContent's boundary
    <RecipientsContent>                            ← stays rendered ✓
      <Suspense fallback={null}>                   ← PreApproveModal's local boundary
        <PreApproveModal />                        ← throws Promise 💥
      </Suspense>                                  ← caught here locally ✓
                                                   → renders null briefly
                                                   → RecipientsContent untouched ✓
    </RecipientsContent>
  </Suspense>
```

---

## What This Taught Me

The bug came from a gap between how I thought React lazy loading worked and how it actually works.

I thought of dynamic imports as a one-time cost — the component loads, the skeleton disappears, and from that point on the component behaves like any other. In terms of the chunk download, that's true. But in terms of Suspense, the boundary doesn't know or care whether the chunk was previously loaded. It only knows whether something inside its subtree is currently suspended.

The moment I understood that Suspense boundaries catch thrown Promises from any descendant regardless of load history, the entire behaviour became predictable. And once behaviour is predictable, bugs stop being mysterious.

Every dynamic import is a potential Promise throw. Give it a boundary close enough to catch it before it reaches something you don't want interrupted.

---

## Frequently Asked Questions

**What is React Suspense bubbling?**
Suspense bubbling is what happens when a component throws a Promise — the standard mechanism for React lazy loading — and there is no local Suspense boundary to catch it. The Promise travels up the component tree until it reaches the nearest ancestor Suspense boundary, which then unmounts its entire subtree and shows its fallback UI.

**Why does a skeleton appear again for a component that was already loaded?**
A Suspense boundary catches any suspension from any descendant, at any time. Even if the parent component itself is fully loaded, a child component suspending inside its tree causes the entire Suspense subtree to unmount and show the fallback. The parent's load state is irrelevant — what matters is whether any descendant is currently suspended.

**What does `{ loading: () => null }` do in Next.js dynamic imports?**
It creates a local Suspense boundary around the dynamically imported component with `null` as the fallback. When the component suspends while its chunk downloads, the suspension is caught locally and renders nothing. This prevents the suspension from bubbling up to a parent Suspense boundary and disrupting already-rendered parts of the page.

**How does `React.lazy` work under the hood?**
When a lazily imported component renders before its JavaScript chunk has downloaded, React throws a Promise as an exception. React catches this using the nearest Suspense boundary up the component tree and renders the boundary's fallback UI. When the Promise resolves — meaning the chunk has downloaded — React re-renders the component normally.

**When should you use `loading: () => null` vs a real skeleton in dynamic imports?**
Use `loading: () => null` for components that are not visible until triggered by user action — modals, drawers, tooltips, popovers. They don't need a visible loading state because the user triggered them and the download is typically fast. Use a real skeleton for components that are visible on initial render — page sections, content areas — where the user needs a placeholder while the content loads. Also use a real skeleton for any component that is genuinely heavy to download, regardless of when it appears — if the chunk is large enough that the user will notice a delay, a skeleton gives them feedback that something is on its way.

---

*Co-written with AI.*
