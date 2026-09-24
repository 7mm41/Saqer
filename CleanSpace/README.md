# CleanSpace

**Local-first, intelligent storage declutter for iOS.** Finds similar photos,
old screenshots, heavy videos, and burst duplicates using on-device Vision, and
lets you triage them with a swipe. 100% offline — your photos never leave the
device, and the app makes no network calls at all.

- **Platform:** iOS 17.0+ · SwiftUI · Swift 5.9
- **Frameworks:** PhotoKit, Vision (`VNGenerateImageFeaturePrintRequest`), SwiftData, Swift Concurrency
- **Architecture:** MVVM with an injected composition root (`AppEnvironment`); actors isolate the heavy Vision + image work off the main thread.

> ⚠️ **Build environment note.** This source tree was authored on Linux and
> **cannot be compiled here** — it needs Xcode on a Mac. The photo-similarity and
> deletion features also only work on a **real device** (the Simulator has an
> empty, non-representative library and can't exercise `PHAssetChangeRequest`
> deletion prompts realistically).

---

## Project structure

```
CleanSpace/
├── project.yml                     # XcodeGen spec (one-command project generation)
└── CleanSpace/
    ├── App/
    │   └── CleanSpaceApp.swift      # @main · builds ModelContainer + AppEnvironment
    ├── Resources/
    │   └── Info.plist               # NSPhotoLibraryUsageDescription lives here
    ├── Models/
    │   ├── MediaItem.swift          # Sendable value-type view over PHAsset
    │   ├── SimilarGroup.swift       # a cluster + its reclaimable-bytes math
    │   ├── ScanCategory.swift       # the 4 buckets + ScanResult snapshot
    │   ├── ScanProgress.swift       # live scan state
    │   └── StorageInfo.swift        # device capacity + media share
    ├── Services/
    │   ├── PermissionsManager.swift # PhotoKit .readWrite authorization
    │   ├── PhotoLibraryService.swift# fetch / size / delete (all raw PhotoKit)
    │   ├── SimilarityEngine.swift   # actor · Vision feature prints + distances
    │   ├── ScanEngine.swift         # @Observable orchestrator (batched, cancellable)
    │   ├── ThumbnailProvider.swift  # actor · bounded, cached thumbnails
    │   ├── StorageService.swift     # device volume capacity
    │   └── HapticsManager.swift     # UIFeedbackGenerator wrapper
    ├── Persistence/
    │   ├── Preferences.swift        # UserDefaults-backed settings
    │   └── ScanCache.swift          # SwiftData: bin records + scan summary
    ├── ViewModels/
    │   ├── AppEnvironment.swift     # composition root injected via .environment
    │   ├── BinStore.swift           # the trash bin (SwiftData-backed)
    │   ├── TriageViewModel.swift    # swipe-decision state machine
    │   └── BinViewModel.swift       # runs the system deletion + reports outcome
    └── Views/
        ├── RootView.swift           # onboarding / access-wall / dashboard router
        ├── Onboarding/              # WelcomeView + PermissionRequestView
        ├── Dashboard/               # StorageRingView, CategoryCard, DashboardView
        ├── Scan/                    # ScanProgressView (circular, live stats)
        ├── Triage/                  # SwipeCardView, AutoSelectBanner, TriageView
        ├── Bin/                     # BinReviewView (Review & Execute)
        └── Common/                  # AsyncThumbnail, state views
```

---

## Getting it into Xcode

### Option A — XcodeGen (recommended)

```bash
brew install xcodegen         # once
cd CleanSpace
xcodegen generate
open CleanSpace.xcodeproj
```

### Option B — no tooling

1. In Xcode: **File → New → Project → iOS → App**. Name it `CleanSpace`,
   interface **SwiftUI**, language **Swift**, storage **None**.
2. Delete the generated `ContentView.swift` and the default `App` file.
3. Drag the `CleanSpace/CleanSpace/` folder (App, Models, Services, …) into the
   project ("Create groups", add to the CleanSpace target).
4. Set the target's **Info.plist** to `Resources/Info.plist`, or add the
   `NSPhotoLibraryUsageDescription` key to the auto-generated one.

### Then, for both options
- Select the **CleanSpace** target → **Signing & Capabilities** → pick your Team.
- Set **Minimum Deployments = iOS 17.0**.
- Build & run on a **real iPhone** with photos on it.

No Apple Developer capabilities (App Groups, CallKit, etc.) are required — the
app is self-contained and offline. A free personal team is enough to run it on
your own device.

---

## How the scan works

1. **Fetch** photos chronologically (oldest → newest) so temporally-adjacent
   shots — the most likely look-alikes — sit next to each other.
2. **Bursts** are grouped for free via `PHAsset.burstIdentifier` (no Vision).
3. **Feature prints** are computed for the rest with
   `VNGenerateImageFeaturePrintRequest`, one at a time inside the
   `SimilarityEngine` actor, in batches of 50 with `Task.yield()` between them so
   the UI stays responsive and memory stays flat on older devices.
4. **Clustering** compares each photo to open groups within a 20-minute window
   using `VNFeaturePrintObservation.computeDistance`. Tight clusters become
   "Duplicates"; looser ones become "Similar".
5. Each group's **hero** (highest resolution, then largest file) is suggested as
   the keeper for one-tap "Smart pick".

### Deletion is always safe
Nothing is deleted during triage — decisions go to a SwiftData-backed **bin**.
Only on **Review & Execute** do we call `PHAssetChangeRequest.deleteAssets`,
which triggers **iOS's own system confirmation sheet**. If you cancel it, the
app catches `PHPhotosError.userCancelled` and leaves everything untouched.

---

## Honest caveats & tuning notes

- **Similarity thresholds are empirical.** Vision feature-print distances live on
  a ~0…1.5 scale (0 = identical), *not* the "distance < 10" from the original
  brief. Defaults are `similar = 0.35`, `duplicate = 0.12` in
  `SimilarityEngine.Thresholds` — tune them on-device against your own library.
- **File sizes** use `PHAssetResource`'s `fileSize` KVC value, which is stable
  and widely used but undocumented; there's a pixel/duration-based fallback if
  it's ever unavailable.
- **Background behavior:** Vision work can't reliably continue once the app is
  backgrounded, so the scan **pauses** on `didEnterBackground` and can be resumed
  from the dashboard. It does not use `BGProcessingTask` (out of scope, but a
  natural next step).
- **Large libraries:** the media-total pass for the storage ring is O(n) over the
  library and runs off the main actor; it fills in a moment after launch.
- **iCloud photos:** all image requests set `isNetworkAccessAllowed = false`, so
  originals stored only in iCloud won't be downloaded — analysis uses the
  on-device thumbnail/representation. This preserves the offline guarantee.

---

## Roadmap ideas
- `BGProcessingTask` to finish long scans in the background.
- A settings screen exposing the similarity thresholds and haptics toggle.
- Localization (the UI strings are centralized and ready to extract).
