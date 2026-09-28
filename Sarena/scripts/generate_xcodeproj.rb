#!/usr/bin/env ruby
# frozen_string_literal: true

# Regenerates Sarena.xcodeproj from the folder structure, so the project file
# never drifts from the sources on disk.
#
#   gem install xcodeproj
#   ruby scripts/generate_xcodeproj.rb
#
# Every .swift file under Sarena/ joins the app target, every .swift file under
# SarenaTests/ joins the unit-test target, and asset catalogs / string catalogs
# are copied as resources.

require 'fileutils'
require 'xcodeproj'

ROOT = File.expand_path('..', __dir__)
PROJECT_PATH = File.join(ROOT, 'Sarena.xcodeproj')
DEPLOYMENT_TARGET = '17.0'
BUNDLE_ID = 'om.sarena.app'
ALTERNATE_ICONS = %w[AppIcon-Glass AppIcon-Midnight AppIcon-Frost AppIcon-NationalDay AppIcon-Ramadan AppIcon-Eid].freeze
RESOURCE_EXTENSIONS = %w[.xcassets .xcstrings].freeze
# Folder-like bundles that must be referenced as a single file.
BUNDLE_EXTENSIONS = %w[.xcassets].freeze

FileUtils.rm_rf(PROJECT_PATH)
project = Xcodeproj::Project.new(PROJECT_PATH)
project.root_object.attributes['LastSwiftUpdateCheck'] = '1600'
project.root_object.attributes['LastUpgradeCheck'] = '1600'
project.root_object.attributes['ORGANIZATIONNAME'] = 'Sarena'
project.root_object.development_region = 'en'
project.root_object.known_regions = %w[en ar Base]

app = project.new_target(:application, 'Sarena', :ios, DEPLOYMENT_TARGET, nil, :swift)
tests = project.new_target(:unit_test_bundle, 'SarenaTests', :ios, DEPLOYMENT_TARGET, nil, :swift)
tests.add_dependency(app)

# Swift links Foundation automatically; drop the SDK-versioned framework
# reference the gem adds so the project works with any Xcode version.
[app, tests].each do |target|
  target.frameworks_build_phase.files.to_a.each do |build_file|
    build_file.file_ref&.remove_from_project
    build_file.remove_from_project
  end
end
project.frameworks_group.groups.to_a.each(&:remove_from_project)

def add_tree(group, directory, target)
  Dir.children(directory).sort.each do |name|
    next if name.start_with?('.')

    path = File.join(directory, name)
    if File.directory?(path) && !BUNDLE_EXTENSIONS.include?(File.extname(name))
      add_tree(group.new_group(name, name), path, target)
      next
    end

    reference = group.new_file(name)
    extension = File.extname(name)
    reference.last_known_file_type = 'text.json.xcstrings' if extension == '.xcstrings'
    if extension == '.swift'
      target.source_build_phase.add_file_reference(reference)
    elsif RESOURCE_EXTENSIONS.include?(extension)
      target.resources_build_phase.add_file_reference(reference)
    end
  end
end

add_tree(project.main_group.new_group('Sarena', 'Sarena'), File.join(ROOT, 'Sarena'), app)
add_tree(project.main_group.new_group('SarenaTests', 'SarenaTests'), File.join(ROOT, 'SarenaTests'), tests)
project.main_group.new_file('README.md')

app.build_configurations.each do |config|
  settings = config.build_settings
  settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = BUNDLE_ID
  settings['MARKETING_VERSION'] = '1.0.0'
  settings['CURRENT_PROJECT_VERSION'] = '1'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
  settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  settings['SWIFT_VERSION'] = '5.0'
  settings['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  settings['LOCALIZATION_PREFERS_STRING_CATALOGS'] = 'YES'
  settings['ENABLE_PREVIEWS'] = 'YES'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['DEVELOPMENT_TEAM'] = '' # Set your team in Signing & Capabilities.
  # Push notifications (aps-environment).
  settings['CODE_SIGN_ENTITLEMENTS'] = 'Sarena/Sarena.entitlements'
  settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks']

  # Info.plist: generated keys merged with Sarena/Resources/Info.plist
  # (CFBundleLocalizations, UILaunchScreen, UIPrefersShowingLanguageSettings).
  settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  settings['INFOPLIST_FILE'] = 'Sarena/Resources/Info.plist'
  settings['INFOPLIST_KEY_CFBundleDisplayName'] = 'Sarena'
  settings['INFOPLIST_KEY_LSApplicationCategoryType'] = 'public.app-category.lifestyle'
  settings['INFOPLIST_KEY_UIApplicationSceneManifest_Generation'] = 'YES'
  settings['INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents'] = 'YES'
  settings['INFOPLIST_KEY_UISupportedInterfaceOrientations'] = 'UIInterfaceOrientationPortrait'
  settings['INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad'] =
    'UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown ' \
    'UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight'

  # App icons: primary + the alternates used by SettingsViewModel.setIcon(_:).
  settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  settings['ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES'] = ALTERNATE_ICONS.join(' ')
  settings['ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS'] = 'NO'
  settings['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = 'AccentColor'
end

tests.build_configurations.each do |config|
  settings = config.build_settings
  settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{BUNDLE_ID}.tests"
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
  settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  settings['SWIFT_VERSION'] = '5.0'
  settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/Sarena.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/Sarena'
  settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
end

project.predictabilize_uuids # stable object IDs → reviewable diffs on regeneration
project.save

scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app, tests, launch_target: true)
scheme.test_action.code_coverage_enabled = true
scheme.save_as(PROJECT_PATH, 'Sarena', true)

puts "Generated #{PROJECT_PATH}"
