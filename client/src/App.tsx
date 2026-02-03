import { useState, useEffect, useRef } from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
  picture?: string;
}

interface BookmarkGroup {
  id: string;
  name: string;
  userId: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Bookmark {
  id: string;
  url: string;
  name: string;
  image: string;
  groupId: string;
}

interface ContextMenu {
  x: number;
  y: number;
  bookmark: Bookmark;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [groups, setGroups] = useState<BookmarkGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showManageGroupsModal, setShowManageGroupsModal] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editingGroup, setEditingGroup] = useState<BookmarkGroup | null>(null);
  const [groupFormData, setGroupFormData] = useState({ name: "" });
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMoveToSubmenu, setShowMoveToSubmenu] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    bookmarkId: string;
  } | null>(null);
  const [deletedBookmark, setDeletedBookmark] = useState<Bookmark | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    url: "",
    name: "",
    image: null as File | null,
  });
  const [imagePreview, setImagePreview] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseUrl = import.meta.env.DEV ? "http://localhost:3001" : "";

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchGroups();
    }
  }, [user]);

  useEffect(() => {
    if (selectedGroupId) {
      fetchBookmarks();
    }
  }, [selectedGroupId]);

  // Close context menus when clicking anywhere
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setShowUserMenu(false);
      setShowMoveToSubmenu(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        credentials: "include",
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/groups`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setGroups(data);
        // Select first group by default
        if (data.length > 0 && !selectedGroupId) {
          setSelectedGroupId(data[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to fetch groups:", error);
    }
  };

  const fetchBookmarks = async () => {
    if (!selectedGroupId) return;

    try {
      const response = await fetch(
        `${baseUrl}/api/bookmarks?groupId=${selectedGroupId}`,
        {
          credentials: "include",
        },
      );
      if (response.ok) {
        const data = await response.json();
        setBookmarks(data);
      }
    } catch (error) {
      console.error("Failed to fetch bookmarks:", error);
    }
  };

  const handleLogin = () => {
    window.location.href = `${baseUrl}/api/auth/google`;
  };

  const handleLogout = async () => {
    try {
      await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
      setBookmarks([]);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const openModal = (bookmark?: Bookmark) => {
    if (bookmark) {
      setEditingBookmark(bookmark);
      setFormData({
        url: bookmark.url,
        name: bookmark.name,
        image: null,
      });
      // Check if image URL is absolute (S3) or relative (local)
      const imageUrl = bookmark.image
        ? bookmark.image.startsWith("http")
          ? bookmark.image
          : `${baseUrl}${bookmark.image}`
        : "";
      setImagePreview(imageUrl);
    } else {
      setEditingBookmark(null);
      setFormData({ url: "", name: "", image: null });
      setImagePreview("");
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBookmark(null);
    setFormData({ url: "", name: "", image: null });
    setImagePreview("");
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, image: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const formDataToSend = new FormData();
    formDataToSend.append("url", formData.url);
    formDataToSend.append("name", formData.name);
    if (!editingBookmark && selectedGroupId) {
      formDataToSend.append("groupId", selectedGroupId);
    }
    if (formData.image) {
      formDataToSend.append("image", formData.image);
    }

    try {
      const url = editingBookmark
        ? `${baseUrl}/api/bookmarks/${editingBookmark.id}`
        : `${baseUrl}/api/bookmarks`;

      const response = await fetch(url, {
        method: editingBookmark ? "PUT" : "POST",
        credentials: "include",
        body: formDataToSend,
      });

      if (response.ok) {
        fetchBookmarks();
        closeModal();
      }
    } catch (error) {
      console.error("Failed to save bookmark:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    // Store the bookmark before deletion for undo
    const bookmark = bookmarks.find((b) => b.id === id);
    if (!bookmark) return;

    setDeletedBookmark(bookmark);

    try {
      const response = await fetch(`${baseUrl}/api/bookmarks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        fetchBookmarks();
        setToast({ message: "Bookmark deleted", bookmarkId: id });

        // Auto-hide toast after 5 seconds
        setTimeout(() => {
          setToast(null);
          setDeletedBookmark(null);
        }, 5000);
      }
    } catch (error) {
      console.error("Failed to delete bookmark:", error);
    }
  };

  const handleUndo = async () => {
    if (!deletedBookmark) return;

    try {
      const response = await fetch(
        `${baseUrl}/api/bookmarks/${deletedBookmark.id}/restore`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (response.ok) {
        fetchBookmarks();
        setToast(null);
        setDeletedBookmark(null);
      }
    } catch (error) {
      console.error("Failed to undo delete:", error);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, bookmark: Bookmark) => {
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY, bookmark });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${baseUrl}/api/groups`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupFormData.name }),
      });
      if (response.ok) {
        fetchGroups();
        setShowGroupModal(false);
        setGroupFormData({ name: "" });
      }
    } catch (error) {
      console.error("Failed to create group:", error);
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;

    try {
      const response = await fetch(`${baseUrl}/api/groups/${editingGroup.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupFormData.name }),
      });
      if (response.ok) {
        fetchGroups();
        setEditingGroup(null);
        setGroupFormData({ name: "" });
      }
    } catch (error) {
      console.error("Failed to update group:", error);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    // Prevent deleting the currently selected group
    if (groupId === selectedGroupId) {
      alert(
        "Cannot delete the currently selected group. Please select a different group first.",
      );
      return;
    }

    try {
      const response = await fetch(
        `${baseUrl}/api/groups/${groupId}?selectedGroupId=${selectedGroupId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (response.ok) {
        fetchGroups();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete group");
      }
    } catch (error) {
      console.error("Failed to delete group:", error);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder bookmarks array
    const newBookmarks = [...bookmarks];
    const [draggedBookmark] = newBookmarks.splice(draggedIndex, 1);
    newBookmarks.splice(dropIndex, 0, draggedBookmark);

    // Update local state immediately for smooth UX
    setBookmarks(newBookmarks);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Send new order to server
    try {
      const bookmarkIds = newBookmarks.map((b) => b.id);
      await fetch(`${baseUrl}/api/bookmarks/reorder`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmarkIds }),
      });
    } catch (error) {
      console.error("Failed to reorder bookmarks:", error);
      // Revert on error
      fetchBookmarks();
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleBookmarkClick = (url: string) => {
    // Ensure URL has protocol
    const formattedUrl =
      url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `https://${url}`;
    window.location.href = formattedUrl;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-xl text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-8">
            Welcome to Your Homepage
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            Sign in to access your personalized bookmarks
          </p>
          <button
            onClick={handleLogin}
            className="bg-white text-gray-900 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="px-4 py-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          {/* Group Selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedGroupId || ""}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "new") {
                  setShowGroupModal(true);
                } else {
                  setSelectedGroupId(value);
                }
              }}
              className="bg-white/10 text-white px-4 py-2 rounded-lg border border-white/20 hover:bg-white/20 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {groups.map((group) => (
                <option
                  key={group.id}
                  value={group.id}
                  className="text-gray-900"
                >
                  {group.name}
                </option>
              ))}
              <option value="new" className="text-gray-900 font-semibold">
                + New Group
              </option>
            </select>
            <button
              onClick={() => setShowManageGroupsModal(true)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
              title="Manage Groups"
            >
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-4">
            {user.picture && (
              <img
                src={user.picture}
                alt={user.name || ""}
                className="w-10 h-10 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <span className="text-white">{user.name}</span>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUserMenu(!showUserMenu);
                }}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center"
              >
                <svg
                  className="w-5 h-5 text-white"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <circle cx="8" cy="2.5" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="13.5" r="1.5" />
                </svg>
              </button>
              {showUserMenu && (
                <div
                  className="absolute right-0 mt-2 bg-white rounded-lg shadow-xl py-2 z-50 min-w-[120px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left hover:bg-gray-100 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Bookmarks Grid */}
        <div
          className="grid gap-6 justify-center"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 180px))",
          }}
        >
          {bookmarks.map((bookmark, index) => (
            <div
              key={bookmark.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => handleBookmarkClick(bookmark.url)}
              onContextMenu={(e) => handleContextMenu(e, bookmark)}
              className={`group relative bg-white/10 backdrop-blur-sm rounded-2xl p-6 cursor-pointer hover:bg-white/20 transition-all hover:scale-105 hover:shadow-2xl ${
                dragOverIndex === index ? "ring-2 ring-purple-500" : ""
              } ${draggedIndex === index ? "opacity-50 cursor-move" : ""}`}
            >
              <div className="aspect-square flex items-center justify-center mb-3">
                {bookmark.image ? (
                  <img
                    src={
                      bookmark.image.startsWith("http")
                        ? bookmark.image
                        : `${baseUrl}${bookmark.image}`
                    }
                    alt={bookmark.name}
                    className="w-full h-full object-contain rounded-xl"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                    <span className="text-4xl text-white font-bold">
                      {bookmark.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <h3 className="text-white text-center font-medium truncate">
                {bookmark.name}
              </h3>
            </div>
          ))}

          {/* Add Bookmark Button */}
          <div
            onClick={() => openModal()}
            className="group relative bg-white/10 backdrop-blur-sm rounded-2xl p-6 cursor-pointer hover:bg-white/20 transition-all hover:scale-105 hover:shadow-2xl border-2 border-dashed border-white/30"
          >
            <div className="aspect-square flex items-center justify-center mb-3">
              <svg
                className="w-16 h-16 text-white/50 group-hover:text-white/80 transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <h3 className="text-white/70 text-center font-medium group-hover:text-white/90">
              Add Bookmark
            </h3>
          </div>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed bg-white rounded-lg shadow-xl py-2 z-50 min-w-[150px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                openModal(contextMenu.bookmark);
                setContextMenu(null);
              }}
              className="w-full px-6 py-2 text-left hover:bg-gray-100 transition-colors"
            >
              Edit
            </button>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMoveToSubmenu(!showMoveToSubmenu);
                }}
                className="w-full px-6 py-2 text-left hover:bg-gray-100 transition-colors flex items-center justify-between"
              >
                <span>Move To</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {showMoveToSubmenu && (
                <div className="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl py-2 min-w-[150px]">
                  {groups.filter(g => g.id !== contextMenu.bookmark.groupId).map(group => (
                    <button
                      key={group.id}
                      onClick={async () => {
                        try {
                          const response = await fetch(`${baseUrl}/api/bookmarks/${contextMenu.bookmark.id}/move`, {
                            method: 'PATCH',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ groupId: group.id })
                          });
                          if (response.ok) {
                            fetchBookmarks();
                            setContextMenu(null);
                            setShowMoveToSubmenu(false);
                          }
                        } catch (error) {
                          console.error('Failed to move bookmark:', error);
                        }
                      }}
                      className="w-full px-6 py-2 text-left hover:bg-gray-100 transition-colors"
                    >
                      {group.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                handleDelete(contextMenu.bookmark.id);
                setContextMenu(null);
              }}
              className="w-full px-6 py-2 text-left hover:bg-gray-100 text-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h2 className="text-2xl font-bold mb-6">
                {editingBookmark ? "Edit Bookmark" : "Add Bookmark"}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL
                  </label>
                  <input
                    type="text"
                    value={formData.url}
                    onChange={(e) =>
                      setFormData({ ...formData, url: e.target.value })
                    }
                    placeholder="https://example.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Image
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 transition-colors"
                  >
                    {imagePreview ? "Change Image" : "Upload Image"}
                  </button>
                  {imagePreview && (
                    <div className="mt-4 flex items-center justify-center bg-gray-50 rounded-lg" style={{ height: '200px' }}>
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="max-w-full max-h-full object-contain rounded-lg"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>{editingBookmark ? "Update" : "Create"}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* New Group Modal */}
        {showGroupModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h2 className="text-2xl font-bold mb-6">Create New Group</h2>
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Group Name
                  </label>
                  <input
                    type="text"
                    value={groupFormData.name}
                    onChange={(e) => setGroupFormData({ name: e.target.value })}
                    placeholder="Enter group name"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                    autoFocus
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGroupModal(false);
                      setGroupFormData({ name: "" });
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Manage Groups Modal */}
        {showManageGroupsModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <h2 className="text-2xl font-bold mb-6">Manage Groups</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    {editingGroup?.id === group.id ? (
                      <form
                        onSubmit={handleUpdateGroup}
                        className="flex-1 flex gap-2"
                      >
                        <input
                          type="text"
                          value={groupFormData.name}
                          onChange={(e) =>
                            setGroupFormData({ name: e.target.value })
                          }
                          className="flex-1 px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingGroup(null);
                            setGroupFormData({ name: "" });
                          }}
                          className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="font-medium text-gray-900">
                          {group.name}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingGroup(group);
                              setGroupFormData({ name: group.name });
                            }}
                            className="text-purple-600 hover:text-purple-700 px-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteGroup(group.id)}
                            disabled={group.id === selectedGroupId}
                            className={`px-2 ${
                              group.id === selectedGroupId
                                ? "text-gray-400 cursor-not-allowed"
                                : "text-red-600 hover:text-red-700"
                            }`}
                            title={
                              group.id === selectedGroupId
                                ? "Cannot delete the currently selected group"
                                : "Delete this group"
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowManageGroupsModal(false)}
                className="w-full mt-6 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-2xl p-4 flex items-center gap-3 z-50 animate-slide-in">
            <span className="text-gray-800">{toast.message}</span>
            <button
              onClick={handleUndo}
              className="text-purple-600 font-medium hover:text-purple-700 transition-colors"
            >
              Undo
            </button>
            <button
              onClick={() => {
                setToast(null);
                setDeletedBookmark(null);
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
