/**
 * Send Nearby Incident Alert
 * 
 * This Cloud Function sends push notifications to users when a new verified
 * incident is reported near their location.
 * 
 * Trigger: Firestore onUpdate - incidents collection (when status changes to verified)
 */

const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const {distanceBetween} = require("geofire-common");

module.exports = onDocumentUpdated("incidents/{incidentId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();
  const incidentId = event.params.incidentId;

  // Only send notification when incident becomes verified
  if (beforeData.status !== "verified" && afterData.status === "verified") {
    console.log(`New verified incident: ${incidentId}, sending alerts...`);

    try {
      const db = admin.firestore();

      // Get incident location
      const incidentLat = afterData.location.latitude;
      const incidentLon = afterData.location.longitude;

      // Get all users with alert preferences enabled
      const usersSnapshot = await db.collection("users")
        .where("alertPreferences.enabled", "==", true)
        .get();

      if (usersSnapshot.empty) {
        console.log("No users with alerts enabled");
        return {success: true, notificationsSent: 0};
      }

      // Check severity-based preferences
      const severityMatch = {
        high: "highSeverity",
        medium: "mediumSeverity",
        low: "lowSeverity",
      };

      const severityPref = severityMatch[afterData.severity] || "lowSeverity";

      // Find nearby users and send notifications
      const notifications = [];
      const fcmTokens = [];

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();

        // Check if user wants alerts for this severity
        if (!userData.alertPreferences[severityPref]) {
          return;
        }

        // Check if user has location data
        if (!userData.location || !userData.location.latitude || !userData.location.longitude) {
          return;
        }

        // Calculate distance
        const distance = distanceBetween(
          [incidentLat, incidentLon],
          [userData.location.latitude, userData.location.longitude]
        );

        // Check if within alert radius
        const alertRadius = userData.alertRadius || 5; // Default 5km
        
        if (distance <= alertRadius) {
          // User is nearby, prepare notification
          const notification = {
            userId: doc.id,
            incidentId,
            title: getNotificationTitle(afterData.severity, afterData.type),
            body: getNotificationBody(afterData.type, distance, afterData.location.address),
            type: "nearby_incident",
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            readAt: null,
            actionUrl: `/incident/${incidentId}`,
            priority: afterData.severity === "high" ? "high" : "normal",
          };

          notifications.push(notification);

          // Add FCM token if available
          if (userData.fcmToken) {
            fcmTokens.push({
              token: userData.fcmToken,
              notification,
            });
          }
        }
      });

      console.log(`Found ${notifications.length} users to notify`);

      // Save notifications to Firestore
      const batch = db.batch();
      notifications.forEach((notification) => {
        const docRef = db.collection("notifications").doc();
        batch.set(docRef, notification);
      });
      await batch.commit();

      // Send push notifications via FCM
      let sentCount = 0;
      if (fcmTokens.length > 0) {
        sentCount = await sendPushNotifications(fcmTokens, afterData);
      }

      console.log(`Sent ${sentCount} push notifications for incident ${incidentId}`);

      return {
        success: true,
        notificationsSent: sentCount,
        usersNotified: notifications.length,
      };
    } catch (error) {
      console.error(`Error sending alerts for incident ${incidentId}:`, error);
      return {success: false, error: error.message};
    }
  }

  return {success: true, notificationsSent: 0, reason: "Status not changed to verified"};
});

/**
 * Generate notification title based on severity and type
 */
function getNotificationTitle(severity, type) {
  const severityEmoji = {
    high: "🚨",
    medium: "⚠️",
    low: "ℹ️",
  };

  const emoji = severityEmoji[severity] || "ℹ️";
  const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

  return `${emoji} ${capitalizedType} Alert Nearby`;
}

/**
 * Generate notification body
 */
function getNotificationBody(type, distance, address) {
  const distanceStr = distance < 1 ? 
    `${Math.round(distance * 1000)}m` : 
    `${distance.toFixed(1)}km`;

  const location = address || "your area";

  return `A ${type} incident was reported ${distanceStr} from you in ${location}. Stay alert.`;
}

/**
 * Send push notifications via Firebase Cloud Messaging
 */
async function sendPushNotifications(fcmTokens, incidentData) {
  try {
    const messaging = admin.messaging();
    let successCount = 0;

    // Send in batches of 500 (FCM limit)
    const batchSize = 500;
    
    for (let i = 0; i < fcmTokens.length; i += batchSize) {
      const batch = fcmTokens.slice(i, i + batchSize);
      
      const messages = batch.map((item) => ({
        token: item.token,
        notification: {
          title: item.notification.title,
          body: item.notification.body,
        },
        data: {
          incidentId: item.notification.incidentId,
          type: item.notification.type,
          severity: incidentData.severity,
          actionUrl: item.notification.actionUrl,
        },
        android: {
          priority: item.notification.priority === "high" ? "high" : "normal",
          notification: {
            sound: "default",
            color: getSeverityColor(incidentData.severity),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      }));

      // Send batch
      const response = await messaging.sendEach(messages);
      successCount += response.successCount;

      // Log failures
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(`Failed to send to token ${batch[idx].token}:`, resp.error);
            
            // If token is invalid, could delete it from user document
            // (implement token cleanup logic here if needed)
          }
        });
      }
    }

    return successCount;
  } catch (error) {
    console.error("Error sending push notifications:", error);
    return 0;
  }
}

/**
 * Get color for notification based on severity
 */
function getSeverityColor(severity) {
  const colors = {
    high: "#EF4444", // Red
    medium: "#F59E0B", // Orange
    low: "#10B981", // Green
  };
  return colors[severity] || "#6B7280"; // Gray default
}
