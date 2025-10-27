"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

// API Configuration
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://script.google.com/macros/s/AKfycbzSviCVLPGawf-4qZs9NFPstiEc0KJTZxApBAXiWnJ0K25nNAo4hQnP43_EHw81_xVERg/exec";

const BOOKING_SECRET =
  process.env.NEXT_PUBLIC_BOOKING_SECRET || "my-secret-key-123";

// yyyy-mm-dd helper
const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TimeSlot {
  start: string;
  end: string;
}

interface AvailabilityResponse {
  days: Array<{ date: string; hasSlots: boolean }>;
  slotsByDay: { [key: string]: TimeSlot[] };
}

export default function BookingModal({ isOpen, onClose }: BookingModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [use24Hour, setUse24Hour] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availableDays, setAvailableDays] = useState<Set<string>>(new Set());
  const [slotsByDay, setSlotsByDay] = useState<{ [key: string]: TimeSlot[] }>(
    {}
  );
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [formData, setFormData] = useState({ name: "", email: "", notes: "" });

  // Visitor timezone
  const visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Fetch availability when modal opens or month changes
  useEffect(() => {
    if (isOpen) fetchAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentMonth]);

  const fetchAvailability = async () => {
    setLoading(true);
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      const params = new URLSearchParams({
        path: "availability", // <— Apps Script expects `path`
        start: ymd(firstDay),
        end: ymd(lastDay),
        visitorTz,
        secret: BOOKING_SECRET,
      });

      const url = `${API_BASE_URL}?${params.toString()}`;
      console.log("Fetching availability from:", url);

      const response = await fetch(url, { method: "GET", mode: "cors" });
      console.log("Response status:", response.status);

      // Apps Script often returns 200 for errors — validate JSON shape
      const data = (await response.json()) as Partial<AvailabilityResponse> & {
        error?: string;
      };
      console.log("Availability data:", data);

      if (!data || !Array.isArray(data.days) || !data.slotsByDay) {
        throw new Error(data?.error || "Unexpected response from server");
      }

      const daysSet = new Set(data.days.map((d) => d.date));
      setAvailableDays(daysSet);
      setSlotsByDay(data.slotsByDay);
    } catch (error) {
      console.error("Error fetching availability:", error);
      alert(
        "Erreur lors du chargement des disponibilités. Vérifiez la console pour plus de détails.\n\nAssurez-vous que:\n1. Le script Apps Script est déployé\n2. Le secret est correct\n3. Les feuilles Google Sheets sont configurées"
      );
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    if (use24Hour) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    } else {
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
      return `${displayHour}:${minutes.toString().padStart(2, "0")} ${ampm}`;
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleTimeSelect = (slot: TimeSlot) => {
    setSelectedSlot(slot);
    setShowConfirmation(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;
    setLoading(true);

    try {
      const bookUrl = `${API_BASE_URL}?${new URLSearchParams({
        path: "book", // <— Apps Script expects `path`
      }).toString()}`;

      const response = await fetch(bookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: BOOKING_SECRET,
          slotStart: selectedSlot.start,
          slotEnd: selectedSlot.end,
          visitorTz,
          name: formData.name,
          email: formData.email,
          notes: formData.notes,
        }),
      });

      const result = await response.json();
      if (result?.success) {
        alert(
          `✅ Rendez-vous confirmé!\n\nLien Google Meet: ${result.meetLink}\n\nVous recevrez un email de confirmation.`
        );
        onClose();
        setFormData({ name: "", email: "", notes: "" });
        setSelectedDate(null);
        setSelectedSlot(null);
        setShowConfirmation(false);
      } else if (result?.reason === "conflict") {
        alert("⚠️ Ce créneau n'est plus disponible. Veuillez en choisir un autre.");
        setShowConfirmation(false);
        setSelectedSlot(null);
        await fetchAvailability();
      } else {
        throw new Error(result?.error || "Booking failed");
      }
    } catch (error) {
      console.error("Error booking:", error);
      alert("Erreur lors de la réservation. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  const changeMonth = (direction: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  // Calendar helpers
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: Array<{ date: Date } | null> = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({ date: new Date(year, month, day) });
    }
    return days;
  };

  const calendarDays = generateCalendarDays();
  const monthName = currentMonth.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  const selectedDateKey = selectedDate ? ymd(selectedDate) : undefined;
  const availableSlots = selectedDateKey ? slotsByDay[selectedDateKey] || [] : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[28%_44%_28%] min-h-[600px]">
          {/* Left panel */}
          <div className="p-8 border-r border-gray-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
                AY
              </div>
            </div>

            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Rdv découverte</h2>
            <p className="text-sm text-gray-600 mb-8">un rendez vous de découverte</p>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>30min</span>
              </div>

              <div className="flex items-center gap-3 text-sm text-gray-700">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Google Meet</span>
              </div>

              <div className="flex items-center gap-3 text-sm text-gray-700">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{visitorTz}</span>
              </div>
            </div>
          </div>

          {/* Calendar */}
          <div className="p-8 border-r border-gray-200 bg-gray-50/30">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium text-gray-900 capitalize">{monthName}</h3>
              <div className="flex gap-2">
                <button onClick={() => changeMonth(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button onClick={() => changeMonth(1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-3">
              {["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"].map((day) => (
                <div key={day} className="text-xs font-medium text-gray-500 text-center py-2">
                  {day}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day, index) => {
                  if (!day) return <div key={`empty-${index}`} />;
                  const dateKey = ymd(day.date); // keep same key as backend
                  const isAvailable = availableDays.has(dateKey);
                  const isSelected =
                    selectedDate?.toDateString() === day.date.toDateString();

                  return (
                    <button
                      key={index}
                      onClick={() => isAvailable && handleDateSelect(day.date)}
                      disabled={!isAvailable}
                      className={`aspect-square rounded-lg text-sm font-medium transition-all
                        ${!isAvailable ? "text-gray-300 cursor-not-allowed" : "cursor-pointer"}
                        ${isAvailable && !isSelected ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : ""}
                        ${isSelected ? "bg-gray-900 text-white hover:bg-gray-800" : ""}`}
                    >
                      {day.date.getDate()}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Times / form */}
          <div className="p-8 overflow-y-auto">
            {selectedDate ? (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base font-medium text-gray-900">
                    {selectedDate.toLocaleDateString("fr-FR", {
                      weekday: "short",
                      day: "numeric",
                    })}
                  </h3>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setUse24Hour(false)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                        !use24Hour ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
                      }`}
                    >
                      12 h
                    </button>
                    <button
                      onClick={() => setUse24Hour(true)}
                      className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                        use24Hour ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
                      }`}
                    >
                      24 h
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {availableSlots.length > 0 ? (
                    availableSlots.map((slot, index) => (
                      <button
                        key={index}
                        onClick={() => handleTimeSelect(slot)}
                        className="w-full px-4 py-3 rounded-lg bg-gray-200 hover:bg-gray-300 transition-all text-left flex items-center justify-between"
                      >
                        <span className="text-sm font-medium text-gray-700">
                          {formatTime(slot.start)}
                        </span>
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                      </button>
                    ))
                  ) : (
                    <div className="text-center text-sm text-gray-500 py-8">
                      Aucune disponibilité ce jour
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-500">
                Sélectionnez une date
              </div>
            )}
          </div>
        </div>

        {showConfirmation && selectedSlot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center p-8"
          >
            <div className="w-full max-w-md">
              <button
                onClick={() => setShowConfirmation(false)}
                className="mb-4 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Retour
              </button>

              <h3 className="text-2xl font-semibold text-gray-900 mb-2">
                Confirmez votre rendez-vous
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                {selectedDate?.toLocaleDateString("fr-FR", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                à {formatTime(selectedSlot.start)}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom complet *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="Jean Dupont"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="jean.dupont@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (optionnel)
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                    rows={3}
                    placeholder="Parlez-nous de votre projet..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/30"
                >
                  {loading ? "Réservation en cours..." : "Confirmer le rendez-vous"}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
