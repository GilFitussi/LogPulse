const clusterSessions = new Map();

function setClusterSession(clusterId, session) {
	clusterSessions.set(clusterId, {
		...session,
		clusterId,
	});
}

function getClusterSession(clusterId) {
	return clusterSessions.get(clusterId);
}

function hasClusterSession(clusterId) {
	return clusterSessions.has(clusterId);
}

function clearClusterSession(clusterId) {
	return clusterSessions.delete(clusterId);
}

module.exports = {
	setClusterSession,
	getClusterSession,
	hasClusterSession,
	clearClusterSession,
};
