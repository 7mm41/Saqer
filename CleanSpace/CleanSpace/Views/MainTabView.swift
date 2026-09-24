//
//  MainTabView.swift
//  CleanSpace
//
//  Bottom tab navigation. Each tab is its own stack. On iOS 26 SDK the system
//  renders this as the new floating Liquid Glass tab bar automatically; on
//  earlier systems it's the standard bottom bar. Putting Photos and Contacts
//  here moves the primary options to the bottom and gives each a proper title
//  bar (so the Contacts screen no longer needs a manual back button).
//

import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            // Photos declutter — DashboardView already provides its own stack.
            DashboardView()
                .tabItem { Label("Clean", systemImage: "sparkles") }

            NavigationStack {
                ContactsCleanupView()
            }
            .tabItem { Label("Contacts", systemImage: "person.2.fill") }
        }
    }
}
