'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const {
  clone,
  createDefaultDocument,
  createDefaultProfile,
  normalizeDocument,
  normalizeProfile,
} = require('./automation-contracts');

class ProfileStore {
  constructor(options = {}) {
    const { userDataPath, fileName = 'automation-profiles.json' } = options;
    if (!userDataPath) {
      throw new Error('ProfileStore requires a userDataPath');
    }

    this.filePath = path.join(userDataPath, fileName);
    this.document = null;
  }

  ensureLoaded() {
    if (!this.document) {
      this.load();
    }
    return this.document;
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.document = normalizeDocument(JSON.parse(raw));
    } catch (_) {
      this.document = createDefaultDocument();
      this.save();
    }
    return this.getDocument();
  }

  save() {
    const document = this.ensureLoaded();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(document, null, 2));
  }

  getFilePath() {
    return this.filePath;
  }

  getDocument() {
    return clone(this.ensureLoaded());
  }

  listProfilesSummary() {
    return this.ensureLoaded().profiles.map(profile => ({
      id: profile.id,
      name: profile.name,
      enabled: profile.enabled,
      updatedAt: profile.updatedAt,
    }));
  }

  getActiveProfile() {
    const document = this.ensureLoaded();
    return clone(document.profiles.find(profile => profile.id === document.activeProfileId) || document.profiles[0]);
  }

  getProfile(profileId) {
    const profile = this.ensureLoaded().profiles.find(entry => entry.id === profileId);
    if (!profile) {
      const error = new Error(`Unknown automation profile: ${profileId}`);
      error.code = 'AUTOMATION_PROFILE_NOT_FOUND';
      throw error;
    }
    return clone(profile);
  }

  createProfile(options = {}) {
    const document = this.ensureLoaded();
    const cloneSource = options.cloneFromId
      ? document.profiles.find(profile => profile.id === options.cloneFromId)
      : null;
    const nextProfile = normalizeProfile({
      ...(cloneSource || createDefaultProfile()),
      ...options,
      id: randomUUID(),
      name: options.name || (cloneSource ? `${cloneSource.name} Copy` : 'New Automation Profile'),
      createdAt: new Date().toISOString(),
    });

    document.profiles.push(nextProfile);
    document.activeProfileId = nextProfile.id;
    this.save();
    return clone(nextProfile);
  }

  updateProfile(profileId, changes = {}) {
    const document = this.ensureLoaded();
    const index = document.profiles.findIndex(profile => profile.id === profileId);
    if (index === -1) {
      const error = new Error(`Unknown automation profile: ${profileId}`);
      error.code = 'AUTOMATION_PROFILE_NOT_FOUND';
      throw error;
    }

    document.profiles[index] = normalizeProfile({
      ...document.profiles[index],
      ...changes,
      id: document.profiles[index].id,
      createdAt: document.profiles[index].createdAt,
      updatedAt: new Date().toISOString(),
    });

    this.save();
    return clone(document.profiles[index]);
  }

  deleteProfile(profileId) {
    const document = this.ensureLoaded();
    if (document.profiles.length <= 1) {
      const error = new Error('Cannot delete the last automation profile');
      error.code = 'AUTOMATION_LAST_PROFILE';
      throw error;
    }

    const nextProfiles = document.profiles.filter(profile => profile.id !== profileId);
    if (nextProfiles.length === document.profiles.length) {
      const error = new Error(`Unknown automation profile: ${profileId}`);
      error.code = 'AUTOMATION_PROFILE_NOT_FOUND';
      throw error;
    }

    document.profiles = nextProfiles;
    if (document.activeProfileId === profileId) {
      document.activeProfileId = nextProfiles[0].id;
    }

    this.save();
    return this.getDocument();
  }

  setActiveProfile(profileId) {
    const document = this.ensureLoaded();
    const exists = document.profiles.some(profile => profile.id === profileId);
    if (!exists) {
      const error = new Error(`Unknown automation profile: ${profileId}`);
      error.code = 'AUTOMATION_PROFILE_NOT_FOUND';
      throw error;
    }

    document.activeProfileId = profileId;
    this.save();
    return this.getActiveProfile();
  }

  exportProfiles(destinationPath, profileIds = null, options = {}) {
    const document = this.ensureLoaded();
    const selectedProfiles = Array.isArray(profileIds) && profileIds.length > 0
      ? document.profiles.filter(profile => profileIds.includes(profile.id))
      : document.profiles;

    const exportDocument = createDefaultDocument({
      ...document,
      exportedAt: new Date().toISOString(),
      appVersion: options.appVersion || '',
      profiles: selectedProfiles,
      activeProfileId: selectedProfiles.some(profile => profile.id === document.activeProfileId)
        ? document.activeProfileId
        : selectedProfiles[0]?.id,
    });

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, JSON.stringify(exportDocument, null, 2));
    return destinationPath;
  }

  importProfiles(sourcePath) {
    const importedDocument = normalizeDocument(JSON.parse(fs.readFileSync(sourcePath, 'utf8')));
    const document = this.ensureLoaded();
    const existingIds = new Set(document.profiles.map(profile => profile.id));
    const importedProfiles = importedDocument.profiles.map(profile => {
      if (!existingIds.has(profile.id)) {
        existingIds.add(profile.id);
        return profile;
      }
      return normalizeProfile({
        ...profile,
        id: randomUUID(),
        updatedAt: new Date().toISOString(),
      });
    });

    document.profiles.push(...importedProfiles);
    if (!document.activeProfileId && importedProfiles[0]) {
      document.activeProfileId = importedProfiles[0].id;
    }

    this.save();
    return importedProfiles.map(profile => ({ id: profile.id, name: profile.name }));
  }
}

module.exports = {
  ProfileStore,
};
